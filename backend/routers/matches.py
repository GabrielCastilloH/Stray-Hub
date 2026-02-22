from fastapi import APIRouter, HTTPException

from backend import dependencies
from backend.models.match import FeedbackCreate, MatchResultResponse
from backend.services import firestore_service

router = APIRouter(prefix="/api/v1/sightings", tags=["matches"])


@router.get("/{sighting_id}/matches", response_model=MatchResultResponse)
def get_matches(sighting_id: str):
    db = dependencies.get_firestore_client()

    # Verify sighting exists
    sighting = firestore_service.get_sighting(db, sighting_id)
    if not sighting:
        raise HTTPException(status_code=404, detail="Sighting not found")

    match_result = firestore_service.get_match_result(db, sighting_id)
    if not match_result:
        raise HTTPException(status_code=404, detail="No match results found for this sighting")

    return MatchResultResponse(**match_result)


@router.post("/{sighting_id}/matches/feedback", response_model=MatchResultResponse)
def submit_feedback(sighting_id: str, body: FeedbackCreate):
    db = dependencies.get_firestore_client()

    # Verify sighting exists
    sighting = firestore_service.get_sighting(db, sighting_id)
    if not sighting:
        raise HTTPException(status_code=404, detail="Sighting not found")

    result = firestore_service.update_match_feedback(
        db, sighting_id, body.status.value, body.confirmed_profile_id
    )
    if not result:
        raise HTTPException(status_code=404, detail="No match results found for this sighting")

    return MatchResultResponse(**result)
