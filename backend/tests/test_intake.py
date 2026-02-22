"""Tests for POST /api/v1/profiles/intake endpoint."""
import io
from unittest.mock import patch

from PIL import Image


def _make_test_image(width: int = 640, height: int = 480) -> io.BytesIO:
    """Create a valid JPEG image for testing."""
    img = Image.new("RGB", (width, height), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


@patch("backend.routers.profiles.httpx.Client")
def test_intake_creates_profile_with_photos(mock_httpx_cls, client):
    """Vet intake creates profile with angle-tagged photos and health fields."""
    mock_response = mock_httpx_cls.return_value.__enter__.return_value.post.return_value
    mock_response.status_code = 200
    mock_response.json.return_value = {
        "embedding": [0.1] * 32,
        "model_version": "dogfacenet_v1",
    }

    img1 = _make_test_image()
    img2 = _make_test_image()
    resp = client.post(
        "/api/v1/profiles/intake",
        files=[
            ("files", ("left.jpg", img1.getvalue(), "image/jpeg")),
            ("files", ("face.jpg", img2.getvalue(), "image/jpeg")),
        ],
        data={
            "angles": "left_side,face",
            "name": "Buddy",
            "age_estimate": "2 years",
            "primary_color": "golden",
            "neuter_status": "neutered",
            "clinic_name": "Test Clinic",
        },
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Buddy"
    assert data["age_estimate"] == "2 years"
    assert data["primary_color"] == "golden"
    assert data["neuter_status"] == "neutered"
    assert data["clinic_name"] == "Test Clinic"
    assert data["embedding"] == [0.1] * 32
    assert data["model_version"] == "dogfacenet_v1"
    assert len(data["photos"]) == 2
    assert data["photo_count"] == 2
    assert data["id"]


@patch("backend.routers.profiles.httpx.Client")
def test_intake_minimal_fields(mock_httpx_cls, client):
    """Intake with minimal fields uses defaults."""
    mock_response = mock_httpx_cls.return_value.__enter__.return_value.post.return_value
    mock_response.status_code = 200
    mock_response.json.return_value = {"embedding": [0.0] * 32, "model_version": "test"}

    img = _make_test_image()
    resp = client.post(
        "/api/v1/profiles/intake",
        files=[("files", ("face.jpg", img.getvalue(), "image/jpeg"))],
        data={"angles": "face"},
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Unknown"
    assert data["species"] == "dog"
    assert data["photo_count"] == 1
    assert len(data["photos"]) == 1


@patch("backend.routers.profiles.httpx.Client")
def test_intake_ml_failure_still_creates_profile(mock_httpx_cls, client):
    """When ML embed fails, profile is still created (without embedding)."""
    import httpx

    mock_response = mock_httpx_cls.return_value.__enter__.return_value.post
    mock_response.side_effect = httpx.RequestError("ML down")

    img = _make_test_image()
    resp = client.post(
        "/api/v1/profiles/intake",
        files=[("files", ("face.jpg", img.getvalue(), "image/jpeg"))],
        data={"angles": "face", "name": "NoEmbed"},
    )

    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "NoEmbed"
    assert data.get("embedding") is None or data.get("embedding") == []
