"""Tests for POST /api/v1/search/match endpoint."""
import io
from unittest.mock import patch

import pytest
from PIL import Image


def _make_test_image(width: int = 640, height: int = 480) -> io.BytesIO:
    """Create a valid JPEG image for testing."""
    img = Image.new("RGB", (width, height), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


def _create_profile_with_embedding(client, fake_db, name: str = "Rex", embedding: list[float] | None = None):
    """Create a profile and manually add embedding + face photo to fake store."""
    resp = client.post("/api/v1/profiles", json={"name": name, "species": "dog"})
    assert resp.status_code == 201
    profile_id = resp.json()["id"]

    # Manually add embedding and face photo to fake store (bypasses ML)
    store = fake_db._store
    key = ("profiles", profile_id)
    data = store.get(key, {})
    emb = embedding or [0.1] * 32  # 32-dim placeholder
    data["embedding"] = emb
    data["model_version"] = "test_v1"
    store[key] = data

    # Add face photo to subcollection so get_profile_face_photo_path finds it
    photo_id = "face123"
    photo_key = (f"profiles/{profile_id}/photos", photo_id)
    store[photo_key] = {
        "storage_path": f"profiles/{profile_id}/photos/{photo_id}.jpg",
        "angle": "face",
        "uploaded_at": "2024-01-01T00:00:00Z",
    }

    # Upload a blob so signed URL works
    return profile_id, emb


@patch("backend.routers.search.httpx.Client")
def test_search_match_returns_candidates(mock_httpx_cls, client, fake_db, fake_bucket):
    """Search with valid photos returns match candidates when profiles have embeddings."""
    profile_id, emb = _create_profile_with_embedding(client, fake_db, "Rex")

    # Mock ML embed to return same embedding (perfect match)
    mock_response = mock_httpx_cls.return_value.__enter__.return_value.post.return_value
    mock_response.status_code = 200
    mock_response.json.return_value = {"embedding": emb, "model_version": "test"}

    # Upload a blob for the face photo path so generate_signed_url works
    face_path = f"profiles/{profile_id}/photos/face123.jpg"
    fake_bucket.blob(face_path).upload_from_string(b"fake", content_type="image/jpeg")

    fake_image = _make_test_image()
    resp = client.post(
        "/api/v1/search/match",
        files=[("files", ("photo.jpg", fake_image.getvalue(), "image/jpeg"))],
        data={"latitude": 34.05, "longitude": -118.25},
    )

    assert resp.status_code == 200
    data = resp.json()
    assert data["photos_processed"] == 1
    assert data["embedding_size"] == 32
    assert data["location"]["latitude"] == 34.05
    assert data["location"]["longitude"] == -118.25
    assert len(data["match_candidates"]) >= 1
    cand = data["match_candidates"][0]
    assert cand["profile_id"] == profile_id
    assert cand["name"] == "Rex"
    assert cand["similarity"] >= 0.99  # Same embedding = 1.0
    assert "signed" in cand.get("photo_signed_url", "") or cand.get("photo_signed_url") is None


@patch("backend.routers.search.httpx.Client")
def test_search_match_no_profiles_returns_empty(mock_httpx_cls, client):
    """Search with no profiles in DB returns empty match_candidates."""
    mock_response = mock_httpx_cls.return_value.__enter__.return_value.post.return_value
    mock_response.status_code = 200
    mock_response.json.return_value = {"embedding": [0.1] * 32, "model_version": "test"}

    fake_image = _make_test_image()
    resp = client.post(
        "/api/v1/search/match",
        files=[("files", ("photo.jpg", fake_image.getvalue(), "image/jpeg"))],
        data={"latitude": 34.0, "longitude": -118.0},
    )

    assert resp.status_code == 200
    assert resp.json()["match_candidates"] == []
    assert resp.json()["photos_processed"] == 1


@patch("backend.routers.search.httpx.Client")
def test_search_match_ml_unavailable_returns_empty(mock_httpx_cls, client):
    """When ML service fails, search returns empty candidates."""
    import httpx

    mock_response = mock_httpx_cls.return_value.__enter__.return_value.post
    mock_response.side_effect = httpx.RequestError("Connection refused")

    fake_image = _make_test_image()
    resp = client.post(
        "/api/v1/search/match",
        files=[("files", ("photo.jpg", fake_image.getvalue(), "image/jpeg"))],
        data={"latitude": 34.0, "longitude": -118.0},
    )

    assert resp.status_code == 200
    assert resp.json()["photos_processed"] == 0
    assert resp.json()["embedding_size"] == 0
    assert resp.json()["match_candidates"] == []


def test_search_match_missing_latitude(client):
    """Missing latitude returns 422."""
    fake_image = _make_test_image()
    resp = client.post(
        "/api/v1/search/match",
        files=[("files", ("photo.jpg", fake_image.getvalue(), "image/jpeg"))],
        data={"longitude": -118.0},
    )
    assert resp.status_code == 422


def test_search_match_missing_files(client):
    """Missing files returns 422."""
    resp = client.post(
        "/api/v1/search/match",
        data={"latitude": 34.0, "longitude": -118.0},
    )
    assert resp.status_code == 422
