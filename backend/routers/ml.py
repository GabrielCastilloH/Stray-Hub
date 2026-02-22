import httpx
from fastapi import APIRouter, File, HTTPException, UploadFile

from backend.config import settings
from backend.utils.image import resize_for_embedding

router = APIRouter(prefix="/api/v1", tags=["ml"])


@router.post("/embed")
def get_embedding(file: UploadFile = File(...)):
    """Proxy to ML service: resize image and get embedding."""
    file_data = file.file.read()
    resized = resize_for_embedding(file_data)
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                f"{settings.ml_service_url}/embed",
                files={"file": ("face_224.jpg", resized, "image/jpeg")},
            )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"ML service unavailable: {e}") from e
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="ML service error")
    return resp.json()
