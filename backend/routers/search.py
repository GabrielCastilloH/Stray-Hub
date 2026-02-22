import logging

import httpx
import numpy as np
from fastapi import APIRouter, File, Form, UploadFile

from backend import dependencies
from backend.config import settings
from backend.models.common import GeoPointIn
from backend.models.search import ProfileMatchCandidate, SearchResponse
from backend.services import firestore_service, storage_service
from backend.utils.image import resize_for_embedding

router = APIRouter(prefix="/api/v1/search", tags=["search"])


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
        resized_data = resize_for_embedding(file_data)

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
                face_path = profile.get("face_photo_path")
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
