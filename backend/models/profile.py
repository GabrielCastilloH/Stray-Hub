from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field

from backend.models.common import AnimalSpecies, GeoPointIn, Sex


class SightingEntry(BaseModel):
    """Lightweight log entry appended to profile when field worker confirms a match."""
    timestamp: datetime
    location: GeoPointIn


class ProfileCreate(BaseModel):
    species: AnimalSpecies
    sex: Sex = Sex.unknown
    breed: str = ""
    color_description: str = ""
    distinguishing_features: str = ""
    estimated_age_months: int | None = None
    location_found: GeoPointIn | None = None
    notes: str = ""


class ProfileUpdate(BaseModel):
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
    signed_url: str | None = None
    uploaded_at: datetime
    angle: str | None = None  # face, left_side, right_side, front, back


class ProfileResponse(BaseModel):
    model_config = ConfigDict(protected_namespaces=())

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
    # ML
    embedding: list[float] | None = None
    model_version: str | None = None
    # Sighting log (replaces standalone sightings collection)
    sightings: list[SightingEntry] = []
    last_seen_location: GeoPointIn | None = None
    last_seen_at: datetime | None = None
    # Health/CNVR (from vet intake)
    age_estimate: str = ""
    primary_color: str = ""
    microchip_id: str = ""
    collar_tag_id: str = ""
    neuter_status: str = ""
    surgery_date: str = ""
    rabies: dict = {}
    dhpp: dict = {}
    bite_risk: str = ""
    diseases: list[dict] = []
    clinic_name: str = ""
    intake_location: str = ""
    release_location: str = ""
    profile_number: int | None = None


class ProfileListResponse(BaseModel):
    profiles: list[ProfileResponse]
    next_cursor: str | None = None


class ConfirmSightingRequest(BaseModel):
    latitude: float
    longitude: float
