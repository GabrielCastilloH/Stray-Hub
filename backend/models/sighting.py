from datetime import datetime
from enum import Enum

from pydantic import BaseModel

from backend.models.common import GeoPointIn


class SightingStatus(str, Enum):
    pending = "pending"
    processing = "processing"
    matched = "matched"
    no_match = "no_match"


class SightingCreate(BaseModel):
    location: GeoPointIn
    notes: str = ""


class SightingResponse(BaseModel):
    id: str
    photo_storage_path: str
    photo_signed_url: str | None = None
    location: GeoPointIn
    notes: str
    status: SightingStatus
    created_at: datetime
    updated_at: datetime


class SightingListResponse(BaseModel):
    sightings: list[SightingResponse]
    next_cursor: str | None = None
