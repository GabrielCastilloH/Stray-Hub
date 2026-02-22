import logging
import uuid

import httpx
from fastapi import APIRouter, File, Form, HTTPException, Query, UploadFile

from backend import dependencies
from backend.config import settings
from backend.models.common import AnimalSpecies
from backend.models.profile import (
    ConfirmSightingRequest,
    PhotoMeta,
    ProfileCreate,
    ProfileListResponse,
    ProfileResponse,
    ProfileUpdate,
)
from backend.services import firestore_service, storage_service
from backend.utils.image import resize_for_embedding

router = APIRouter(prefix="/api/v1/profiles", tags=["profiles"])


def _enrich_profile_with_photos(profile: dict) -> ProfileResponse:
    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()
    photos_raw = firestore_service.get_profile_photos(db, profile["id"])
    photos = []
    for p in photos_raw:
        signed_url = storage_service.generate_signed_url(bucket, p["storage_path"])
        photos.append(PhotoMeta(
            photo_id=p["photo_id"],
            signed_url=signed_url,
            uploaded_at=p["uploaded_at"],
            angle=p.get("angle"),
        ))
    return ProfileResponse(**profile, photos=photos)


@router.post("", response_model=ProfileResponse, status_code=201)
def create_profile(body: ProfileCreate):
    db = dependencies.get_firestore_client()
    _, profile_data = firestore_service.create_profile(db, body.model_dump())
    return ProfileResponse(**profile_data)


@router.get("", response_model=ProfileListResponse)
def list_profiles(
    species: AnimalSpecies | None = None,
    cursor: str | None = None,
    limit: int = Query(default=20, ge=1, le=100),
):
    db = dependencies.get_firestore_client()
    profiles, next_cursor = firestore_service.list_profiles(
        db, species=species.value if species else None, cursor=cursor, limit=limit
    )
    return ProfileListResponse(
        profiles=[ProfileResponse(**p) for p in profiles],
        next_cursor=next_cursor,
    )


@router.get("/{profile_id}", response_model=ProfileResponse)
def get_profile(profile_id: str):
    db = dependencies.get_firestore_client()
    profile = firestore_service.get_profile(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _enrich_profile_with_photos(profile)


@router.patch("/{profile_id}", response_model=ProfileResponse)
def update_profile(profile_id: str, body: ProfileUpdate):
    db = dependencies.get_firestore_client()
    update_data = body.model_dump(exclude_none=True)
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")
    profile = firestore_service.update_profile(db, profile_id, update_data)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _enrich_profile_with_photos(profile)


@router.post("/intake", response_model=ProfileResponse, status_code=201)
def create_profile_intake(
    files: list[UploadFile] = File(...),
    angles: str = Form(...),  # comma-separated: left_side,right_side,front,back,face
    name: str = Form("Unknown"),
    sex: str = Form("unknown"),
    age_estimate: str = Form(""),
    primary_color: str = Form(""),
    microchip_id: str = Form(""),
    collar_tag_id: str = Form(""),
    neuter_status: str = Form(""),
    surgery_date: str = Form(""),
    rabies_status: str = Form(""),
    rabies_date_admin: str = Form(""),
    rabies_expiry: str = Form(""),
    rabies_batch: str = Form(""),
    dhpp_status: str = Form(""),
    dhpp_date: str = Form(""),
    bite_risk: str = Form(""),
    diseases_json: str = Form("[]"),  # JSON array of {name, status}
    clinic_name: str = Form(""),
    intake_location: str = Form(""),
    release_location: str = Form(""),
    notes: str = Form(""),
):
    """Vet intake: create profile with multi-angle photos, embed face photo for matching."""
    import json

    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()

    profile_id = uuid.uuid4().hex
    angle_list = [a.strip().lower().replace(" ", "_") for a in angles.split(",") if a.strip()]

    # Map form angles to our schema (left_side, right_side, front, back, face)
    angle_map = {
        "left_side": "left_side",
        "right_side": "right_side",
        "front": "front",
        "back": "back",
        "face": "face",
    }

    try:
        diseases = json.loads(diseases_json) if diseases_json else []
    except json.JSONDecodeError:
        diseases = []

    rabies = {}
    if rabies_status:
        rabies = {
            "status": rabies_status,
            "date_admin": rabies_date_admin or None,
            "expiry": rabies_expiry or None,
            "batch": rabies_batch or None,
        }
    dhpp = {}
    if dhpp_status:
        dhpp = {"status": dhpp_status, "date": dhpp_date or None}

    data = {
        "name": name or "Unknown",
        "species": "dog",
        "sex": sex,
        "age_estimate": age_estimate,
        "primary_color": primary_color,
        "microchip_id": microchip_id,
        "collar_tag_id": collar_tag_id,
        "neuter_status": neuter_status,
        "surgery_date": surgery_date,
        "rabies": rabies,
        "dhpp": dhpp,
        "bite_risk": bite_risk,
        "diseases": diseases,
        "clinic_name": clinic_name,
        "intake_location": intake_location,
        "release_location": release_location,
        "notes": notes,
    }

    _, profile_data = firestore_service.create_profile_from_intake(db, profile_id, data)

    face_storage_path: str | None = None
    face_resized_data: bytes | None = None

    for i, upload_file in enumerate(files):
        if i >= len(angle_list):
            break
        file_data = upload_file.file.read()
        angle = angle_map.get(angle_list[i], angle_list[i])
        photo_id = uuid.uuid4().hex
        storage_path = f"profiles/{profile_id}/photos/{photo_id}.jpg"

        storage_service.upload_file(
            bucket, storage_path, file_data,
            content_type=upload_file.content_type or "image/jpeg",
        )
        firestore_service.add_photo_meta(db, profile_id, photo_id, storage_path, angle=angle)

        if angle == "face":
            face_storage_path = storage_path
            face_resized_data = resize_for_embedding(file_data)

    if face_storage_path and face_resized_data:
        try:
            with httpx.Client(timeout=30.0) as client:
                resp = client.post(
                    f"{settings.ml_service_url}/embed",
                    files={"file": ("face_224.jpg", face_resized_data, "image/jpeg")},
                )
            if resp.status_code == 200:
                ml_result = resp.json()
                firestore_service.update_profile_embedding(
                    db, profile_id, ml_result["embedding"], ml_result.get("model_version", "unknown")
                )
                profile_data["embedding"] = ml_result["embedding"]
                profile_data["model_version"] = ml_result.get("model_version")
        except httpx.RequestError as e:
            logging.warning("ML embed failed for intake profile %s: %s", profile_id, e)

    profile = firestore_service.get_profile(db, profile_id)
    return _enrich_profile_with_photos(profile or profile_data)


@router.post("/{profile_id}/confirm-sighting", response_model=ProfileResponse)
def confirm_sighting(profile_id: str, body: ConfirmSightingRequest):
    """Append sighting to profile and update last_seen when field worker confirms a match."""
    db = dependencies.get_firestore_client()
    result = firestore_service.add_sighting_to_profile(
        db, profile_id, body.latitude, body.longitude
    )
    if not result:
        raise HTTPException(status_code=404, detail="Profile not found")
    return _enrich_profile_with_photos(result)


@router.delete("/{profile_id}", status_code=204)
def delete_profile(profile_id: str):
    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()

    profile = firestore_service.get_profile(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    # Delete all photos from storage
    storage_service.delete_prefix(bucket, f"profiles/{profile_id}/photos/")

    # Delete profile + photo subcollection from Firestore
    firestore_service.delete_profile(db, profile_id)


@router.post("/{profile_id}/photos", response_model=PhotoMeta, status_code=201)
def upload_photo(profile_id: str, file: UploadFile = File(...)):
    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()

    profile = firestore_service.get_profile(db, profile_id)
    if not profile:
        raise HTTPException(status_code=404, detail="Profile not found")

    if profile["photo_count"] >= settings.max_photos_per_profile:
        raise HTTPException(
            status_code=400,
            detail=f"Maximum of {settings.max_photos_per_profile} photos per profile",
        )

    photo_id = uuid.uuid4().hex
    storage_path = f"profiles/{profile_id}/photos/{photo_id}.jpg"

    file_data = file.file.read()
    storage_service.upload_file(bucket, storage_path, file_data, content_type=file.content_type or "image/jpeg")

    photo_meta = firestore_service.add_photo_meta(db, profile_id, photo_id, storage_path)

    signed_url = storage_service.generate_signed_url(bucket, storage_path)
    return PhotoMeta(
        photo_id=photo_id,
        signed_url=signed_url,
        uploaded_at=photo_meta["uploaded_at"],
        angle=photo_meta.get("angle"),
    )


@router.delete("/{profile_id}/photos/{photo_id}", status_code=204)
def delete_photo(profile_id: str, photo_id: str):
    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()

    storage_path = firestore_service.delete_photo_meta(db, profile_id, photo_id)
    if not storage_path:
        raise HTTPException(status_code=404, detail="Photo not found")

    storage_service.delete_file(bucket, storage_path)
