from datetime import datetime
from enum import Enum

from pydantic import BaseModel, ConfigDict

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
    model_config = ConfigDict(protected_namespaces=())

    id: str
    photo_storage_path: str
    photo_resized_storage_path: str | None = None
    photo_signed_url: str | None = None
    location: GeoPointIn
    notes: str
    disease_tags: list[str] = []
    image_width: int | None = None
    image_height: int | None = None
    embedding: list[float] | None = None
    model_version: str | None = None
    status: SightingStatus
    created_at: datetime
    updated_at: datetime


class EmbeddingResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    sighting_id: str
    embedding: list[float]
    model_version: str
    embedding_size: int


class SightingListResponse(BaseModel):
    sightings: list[SightingResponse]
    next_cursor: str | None = None


class MatchCandidate(BaseModel):
    sighting_id: str
    similarity: float
    photo_signed_url: str | None = None


class PipelineResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

    id: str
    photo_storage_paths: list[str]
    photo_resized_storage_paths: list[str]
    photo_signed_urls: list[str | None] = []
    location: GeoPointIn
    notes: str
    disease_tags: list[str] = []
    embedding: list[float] | None = None
    model_version: str | None = None
    photos_embedded: int
    embedding_size: int
    status: SightingStatus
    match_candidates: list[MatchCandidate] = []
    created_at: datetime
    updated_at: datetime
