import uuid

from fastapi import APIRouter, Form, HTTPException, Query, UploadFile, File

from backend import dependencies
from backend.models.sighting import SightingListResponse, SightingResponse, SightingStatus
from backend.services import firestore_service, storage_service

router = APIRouter(prefix="/api/v1/sightings", tags=["sightings"])


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
):
    db = dependencies.get_firestore_client()
    bucket = dependencies.get_storage_bucket()

    sighting_id = uuid.uuid4().hex
    storage_path = f"sightings/{sighting_id}/photo.jpg"

    file_data = file.file.read()
    storage_service.upload_file(bucket, storage_path, file_data, content_type=file.content_type or "image/jpeg")

    data = {"location": {"latitude": latitude, "longitude": longitude}, "notes": notes}
    _, sighting_data = firestore_service.create_sighting(db, storage_path, data)
    sighting_data["photo_storage_path"] = storage_path

    signed_url = storage_service.generate_signed_url(bucket, storage_path)
    return SightingResponse(**sighting_data, photo_signed_url=signed_url)


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
