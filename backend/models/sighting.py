from datetime import datetime
from enum import Enum

from pydantic import BaseModel

from backend.models.common import DiseaseTag, GeoPointIn


class SightingStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    matched = "matched"
    no_match = "no_match"


class SightingCreate(BaseModel):
    location: GeoPointIn
    notes: str = ""
    disease_tags: list[DiseaseTag] = []


class SightingResponse(BaseModel):
    id: str
    photo_storage_path: str
    photo_resized_storage_path: str | None = None
    photo_signed_url: str | None = None
    location: GeoPointIn
    notes: str
    disease_tags: list[str] = []
    image_width: int | None = None
    image_height: int | None = None
    status: SightingStatus
    created_at: datetime
    updated_at: datetime


class SightingListResponse(BaseModel):
    sightings: list[SightingResponse]
    next_cursor: str | None = None
