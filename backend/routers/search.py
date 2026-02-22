import io
import logging

import httpx
import numpy as np
from fastapi import APIRouter, File, Form, UploadFile

from backend import dependencies
from backend.config import settings
from backend.models.common import GeoPointIn
from backend.models.search import ProfileMatchCandidate, SearchResponse
from backend.services import firestore_service, storage_service

router = APIRouter(prefix="/api/v1/search", tags=["search"])


def _resize_image(file_data: bytes) -> bytes:
    """Center-crop and resize image for ML model compatibility."""
    from PIL import Image

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


@router.post("/match", response_model=SearchResponse)
def search_match(
    files: list[UploadFile] = File(...),
    latitude: float = Form(...),
    longitude: float = Form(...),
):
    """
    Ephemeral search: embed field worker face photos in-memory (no storage),
    match against profile embeddings, return up to 5 candidates.
    """
    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()

    embeddings: list[list[float]] = []
    for i, upload_file in enumerate(files):
        file_data = upload_file.file.read()
        resized_data = _resize_image(file_data)

        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    f"{settings.ml_service_url}/embed",
                    files={"file": (f"photo_{i}_224.jpg", resized_data, "image/jpeg")},
                )
            if resp.status_code == 200:
                ml_result = resp.json()
                embeddings.append(ml_result["embedding"])
        except httpx.RequestError as e:
            logging.warning("ML service unavailable for photo %d: %s", i, e)

    averaged_embedding: list[float] | None = None
    if embeddings:
        avg = np.mean(embeddings, axis=0)
        norm = np.linalg.norm(avg)
        if norm > 0:
            avg = avg / norm
        averaged_embedding = avg.tolist()

    match_candidates: list[ProfileMatchCandidate] = []
    if averaged_embedding is not None:
        query_vec = np.array(averaged_embedding)
        profiles = firestore_service.list_profiles_with_embeddings(db)

        for profile in profiles:
            other_emb = np.array(profile["embedding"])
            other_norm = np.linalg.norm(other_emb)
            if other_norm > 0:
                other_emb = other_emb / other_norm
            similarity = float(np.dot(query_vec, other_emb))

            if similarity >= settings.similarity_threshold:
                face_path = firestore_service.get_profile_face_photo_path(db, profile["id"])
                signed_url = (
                    storage_service.generate_signed_url(bucket, face_path) if face_path else None
                )
                match_candidates.append(
                    ProfileMatchCandidate(
                        profile_id=profile["id"],
                        name=profile.get("name", "Unknown"),
                        similarity=round(similarity, 4),
                        photo_signed_url=signed_url,
                    )
                )

        match_candidates.sort(key=lambda c: c.similarity, reverse=True)
        match_candidates = match_candidates[: settings.max_match_results]

    return SearchResponse(
        photos_processed=len(embeddings),
        embedding_size=len(averaged_embedding) if averaged_embedding else 0,
        match_candidates=match_candidates,
        location=GeoPointIn(latitude=latitude, longitude=longitude),
    )
