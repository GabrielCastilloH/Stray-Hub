import io
import uuid

from fastapi import APIRouter, Form, HTTPException, Query, UploadFile, File
from PIL import Image

from backend import dependencies
from backend.models.sighting import SightingListResponse, SightingResponse, SightingStatus
from backend.services import firestore_service, storage_service

router = APIRouter(prefix="/api/v1/sightings", tags=["sightings"])

RESIZED_SIZE = (224, 224)


def _resize_image(file_data: bytes) -> bytes:
    """Resize image to 224x224 for ML model compatibility."""
    img = Image.open(io.BytesIO(file_data))
    img = img.convert("RGB")
    img = img.resize(RESIZED_SIZE, Image.LANCZOS)
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
        "image_width": RESIZED_SIZE[0],
        "image_height": RESIZED_SIZE[1],
    }
    _, sighting_data = firestore_service.create_sighting(db, sighting_id, storage_path, data)
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
