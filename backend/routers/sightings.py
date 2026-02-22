import io
import logging
import uuid

import httpx
import numpy as np
from fastapi import APIRouter, Form, HTTPException, Query, UploadFile, File
from PIL import Image

from backend import dependencies
from backend.config import settings
from backend.models.sighting import (
    EmbeddingResponse,
    MatchCandidate,
    PipelineResponse,
    SightingListResponse,
    SightingResponse,
    SightingStatus,
)
from backend.services import firestore_service, storage_service

router = APIRouter(prefix="/api/v1/sightings", tags=["sightings"])


def _resize_image(file_data: bytes) -> bytes:
    """Center-crop and resize image for ML model compatibility."""
    img = Image.open(io.BytesIO(file_data))
    img = img.convert("RGB")
    w, h = img.size
    short = min(w, h)
    left = (w - short) // 2
    top = (h - short) // 2
    img = img.crop((left, top, left + short, top + short))
    size = (settings.image_resize_size, settings.image_resize_size)
    img = img.resize(size, Image.LANCZOS)
    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=85)
    return buf.getvalue()


def _enrich_sighting(sighting: dict) -> SightingResponse:
    bucket = dependencies.get_storage_bucket()
    signed_url = storage_service.generate_signed_url(bucket, sighting["photo_storage_path"])
    return SightingResponse(**sighting, photo_signed_url=signed_url)


@router.post("", response_model=SightingResponse, status_code=201)
def create_sighting(
    file: UploadFile = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    notes: str = Form(""),
    disease_tags: str = Form(""),
):
    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()

    sighting_id = uuid.uuid4().hex
    storage_path = f"sightings/{sighting_id}/photo.jpg"
    resized_path = f"sightings/{sighting_id}/photo_224.jpg"

    file_data = file.file.read()

    # Upload original
    storage_service.upload_file(
        bucket, storage_path, file_data,
        content_type=file.content_type or "image/jpeg",
    )

    # Resize and upload ML-ready version
    resized_data = _resize_image(file_data)
    storage_service.upload_file(bucket, resized_path, resized_data, content_type="image/jpeg")

    # Parse disease_tags from comma-separated string (form data doesn't natively support lists)
    tags = [t.strip() for t in disease_tags.split(",") if t.strip()] if disease_tags else []

    data = {
        "location": {"latitude": latitude, "longitude": longitude},
        "notes": notes,
        "disease_tags": tags,
        "photo_resized_storage_path": resized_path,
        "image_width": settings.image_resize_size,
        "image_height": settings.image_resize_size,
    }
    _, sighting_data = firestore_service.create_sighting(db, sighting_id, storage_path, data)
    sighting_data["photo_storage_path"] = storage_path

    signed_url = storage_service.generate_signed_url(bucket, storage_path)
    return SightingResponse(**sighting_data, photo_signed_url=signed_url)


@router.post("/pipeline", response_model=PipelineResponse, status_code=201)
def create_sighting_pipeline(
    files: list[UploadFile] = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
    notes: str = Form(""),
    disease_tags: str = Form(""),
):
    """Upload multiple photos, embed them, and run similarity matching in one call."""
    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()

    sighting_id = uuid.uuid4().hex
    tags = [t.strip() for t in disease_tags.split(",") if t.strip()] if disease_tags else []

    photo_paths: list[str] = []
    resized_paths: list[str] = []
    embeddings: list[list[float]] = []
    model_version: str | None = None

    for i, upload_file in enumerate(files):
        file_data = upload_file.file.read()

        # Upload original
        original_path = f"sightings/{sighting_id}/photo_{i}.jpg"
        storage_service.upload_file(
            bucket, original_path, file_data,
            content_type=upload_file.content_type or "image/jpeg",
        )
        photo_paths.append(original_path)

        # Resize and upload ML-ready version
        resized_data = _resize_image(file_data)
        resized_path = f"sightings/{sighting_id}/photo_{i}_224.jpg"
        storage_service.upload_file(bucket, resized_path, resized_data, content_type="image/jpeg")
        resized_paths.append(resized_path)

        # Get embedding from ML service
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    f"{settings.ml_service_url}/embed",
                    files={"file": (f"photo_{i}_224.jpg", resized_data, "image/jpeg")},
                )
            if resp.status_code == 200:
                ml_result = resp.json()
                embeddings.append(ml_result["embedding"])
                model_version = ml_result.get("model_version", model_version)
        except httpx.RequestError as e:
            logging.warning("ML service unavailable for photo %d: %s", i, e)

    # Average embeddings and L2-normalize
    averaged_embedding: list[float] | None = None
    if embeddings:
        avg = np.mean(embeddings, axis=0)
        norm = np.linalg.norm(avg)
        if norm > 0:
            avg = avg / norm
        averaged_embedding = avg.tolist()

    # Store sighting in Firestore
    status = "processing" if averaged_embedding else "pending"
    data = {
        "location": {"latitude": latitude, "longitude": longitude},
        "notes": notes,
        "disease_tags": tags,
        "embedding": averaged_embedding,
        "model_version": model_version,
        "status": status,
    }
    _, sighting_data = firestore_service.create_sighting_multi(
        db, sighting_id, photo_paths, resized_paths, data,
    )

    # Similarity matching
    match_candidates: list[MatchCandidate] = []
    if averaged_embedding is not None:
        query_vec = np.array(averaged_embedding)
        existing = firestore_service.list_sightings_with_embeddings(db, exclude_id=sighting_id)

        for other in existing:
            other_emb = np.array(other["embedding"])
            other_norm = np.linalg.norm(other_emb)
            if other_norm > 0:
                other_emb = other_emb / other_norm
            similarity = float(np.dot(query_vec, other_emb))

            if similarity >= settings.similarity_threshold:
                other_photo_path = other.get("photo_storage_path", "")
                signed_url = storage_service.generate_signed_url(bucket, other_photo_path) if other_photo_path else None
                match_candidates.append(MatchCandidate(
                    sighting_id=other["id"],
                    similarity=round(similarity, 4),
                    photo_signed_url=signed_url,
                ))

        match_candidates.sort(key=lambda c: c.similarity, reverse=True)

        if match_candidates:
            firestore_service.create_match_result(
                db, sighting_id,
                [{"sighting_id": c.sighting_id, "score": c.similarity} for c in match_candidates],
            )
            firestore_service.update_sighting_status(db, sighting_id, "matched")
            sighting_data["status"] = "matched"
        else:
            firestore_service.update_sighting_status(db, sighting_id, "no_match")
            sighting_data["status"] = "no_match"

    # Generate signed URLs for the uploaded photos
    photo_signed_urls = [
        storage_service.generate_signed_url(bucket, p) for p in photo_paths
    ]

    return PipelineResponse(
        id=sighting_id,
        photo_storage_paths=photo_paths,
        photo_resized_storage_paths=resized_paths,
        photo_signed_urls=photo_signed_urls,
        location=sighting_data["location"],
        notes=sighting_data["notes"],
        disease_tags=sighting_data["disease_tags"],
        embedding=averaged_embedding,
        model_version=model_version,
        photos_embedded=len(embeddings),
        embedding_size=len(averaged_embedding) if averaged_embedding else 0,
        status=sighting_data["status"],
        match_candidates=match_candidates,
        created_at=sighting_data["created_at"],
        updated_at=sighting_data["updated_at"],
    )


@router.get("", response_model=SightingListResponse)
def list_sightings(
    status: SightingStatus | None = None,
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
):
    db = dependencies.get_firestore_client()
    sightings, next_cursor = firestore_service.list_sightings(
        db, status=status.value if status else None, cursor=cursor, limit=limit
    )
    return SightingListResponse(
        sightings=[_enrich_sighting(s) for s in sightings],
        next_cursor=next_cursor,
    )


@router.get("/{sighting_id}", response_model=SightingResponse)
def get_sighting(sighting_id: str):
    db = dependencies.get_firestore_client()
    sighting = firestore_service.get_sighting(db, sighting_id)
    if not sighting:
        raise HTTPException(status_code=404, detail="Sighting not found")
    return _enrich_sighting(sighting)


@router.post("/{sighting_id}/embed", response_model=EmbeddingResponse)
def embed_sighting(sighting_id: str):
    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()

    sighting = firestore_service.get_sighting(db, sighting_id)
    if not sighting:
        raise HTTPException(status_code=404, detail="Sighting not found")

    resized_path = sighting.get("photo_resized_storage_path")
    if not resized_path:
        raise HTTPException(status_code=400, detail="Sighting has no resized image")

    image_bytes = storage_service.download_file(bucket, resized_path)
    if image_bytes is None:
        raise HTTPException(status_code=404, detail="Resized image not found in storage")

    with httpx.Client(timeout=30.0) as client:
        resp = client.post(
            f"{settings.ml_service_url}/embed",
            files={"file": ("photo_224.jpg", image_bytes, "image/jpeg")},
        )

    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail=f"ML service error: {resp.text}")

    ml_result = resp.json()
    embedding = ml_result["embedding"]
    model_version = ml_result["model_version"]

    firestore_service.update_sighting_embedding(db, sighting_id, embedding, model_version)

    return EmbeddingResponse(
        sighting_id=sighting_id,
        embedding=embedding,
        model_version=model_version,
        embedding_size=len(embedding),
    )
