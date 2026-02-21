from fastapi import APIRouter, HTTPException

from backend import dependencies

router = APIRouter(prefix="/api/v1", tags=["health"])


@router.get("/health")
def health_check():
    errors = []

    try:
        db = dependencies.get_firestore_client()
        # Attempt a lightweight read to verify connectivity
        list(db.collection("profiles").limit(1).stream())
    except Exception as e:
        errors.append(f"Firestore: {e}")

    try:
        bucket = dependencies.get_storage_bucket()
        bucket.exists()
    except Exception as e:
        errors.append(f"Storage: {e}")

    if errors:
        raise HTTPException(status_code=503, detail={"status": "unhealthy", "errors": errors})

    return {"status": "healthy"}
