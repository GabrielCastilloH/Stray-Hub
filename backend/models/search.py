from pydantic import BaseModel

from backend.models.common import GeoPointIn


class ProfileMatchCandidate(BaseModel):
    profile_id: str
    name: str
    similarity: float
    photo_signed_url: str | None = None


class SearchResponse(BaseModel):
    photos_processed: int
    embedding_size: int
    match_candidates: list[ProfileMatchCandidate]
    location: GeoPointIn
