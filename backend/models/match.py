from datetime import datetime
from enum import Enum

from pydantic import BaseModel


class MatchStatus(str, Enum):
    pending = "pending"
    confirmed = "confirmed"
    rejected = "rejected"


class MatchResultCandidate(BaseModel):
    sighting_id: str
    score: float


class MatchResultResponse(BaseModel):
    sighting_id: str
    candidates: list[MatchResultCandidate]
    status: MatchStatus
    confirmed_profile_id: str | None = None
    created_at: datetime
    updated_at: datetime


class FeedbackCreate(BaseModel):
    status: MatchStatus
    confirmed_profile_id: str | None = None
