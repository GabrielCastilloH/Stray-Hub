from datetime import datetime

from pydantic import BaseModel, Field

from backend.models.common import AnimalSpecies, GeoPointIn, Sex


class ProfileCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=200)
    species: AnimalSpecies
    sex: Sex = Sex.unknown
    breed: str = ""
    color_description: str = ""
    distinguishing_features: str = ""
    estimated_age_months: int | None = None
    location_found: GeoPointIn | None = None
    notes: str = ""


class ProfileUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=200)
    species: AnimalSpecies | None = None
    sex: Sex | None = None
    breed: str | None = None
    color_description: str | None = None
    distinguishing_features: str | None = None
    estimated_age_months: int | None = None
    location_found: GeoPointIn | None = None
    notes: str | None = None


class PhotoMeta(BaseModel):
    photo_id: str
    storage_path: str
    signed_url: str | None = None
    uploaded_at: datetime


class ProfileResponse(BaseModel):
    id: str
    name: str
    species: AnimalSpecies
    sex: Sex
    breed: str
    color_description: str
    distinguishing_features: str
    estimated_age_months: int | None
    location_found: GeoPointIn | None
    notes: str
    photo_count: int
    photos: list[PhotoMeta] = []
    created_at: datetime
    updated_at: datetime


class ProfileListResponse(BaseModel):
    profiles: list[ProfileResponse]
    next_cursor: str | None = None
