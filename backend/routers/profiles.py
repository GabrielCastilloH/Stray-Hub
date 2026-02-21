import uuid

from fastapi import APIRouter, HTTPException, Query, UploadFile, File

from backend import dependencies
from backend.config import settings
from backend.models.common import AnimalSpecies
from backend.models.profile import (
    PhotoMeta,
    ProfileCreate,
    ProfileListResponse,
    ProfileResponse,
    ProfileUpdate,
)
from backend.services import firestore_service, storage_service

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
            storage_path=p["storage_path"],
            signed_url=signed_url,
            uploaded_at=p["uploaded_at"],
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
        storage_path=storage_path,
        signed_url=signed_url,
        uploaded_at=photo_meta["uploaded_at"],
    )


@router.delete("/{profile_id}/photos/{photo_id}", status_code=204)
def delete_photo(profile_id: str, photo_id: str):
    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()

    storage_path = firestore_service.delete_photo_meta(db, profile_id, photo_id)
    if not storage_path:
        raise HTTPException(status_code=404, detail="Photo not found")

    storage_service.delete_file(bucket, storage_path)
