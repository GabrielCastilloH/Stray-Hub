import io
from datetime import datetime, timezone

from PIL import Image


def _make_test_image() -> io.BytesIO:
    img = Image.new("RGB", (100, 100), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


def _create_sighting_with_matches(client, fake_db):
    """Helper: create a sighting and manually insert match results."""
    fake_image = _make_test_image()
    create_resp = client.post(
        "/api/v1/sightings",
        data={"latitude": "34.05", "longitude": "-118.25"},
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    sighting_id = create_resp.json()["id"]

    # Manually insert match results (simulating ML pipeline output)
    now = datetime.now(timezone.utc)
    fake_db.collection("matches").document(sighting_id).set({
        "sighting_id": sighting_id,
        "candidates": [
            {"profile_id": "profile_abc", "score": 0.95},
            {"profile_id": "profile_def", "score": 0.82},
        ],
        "status": "pending",
        "confirmed_profile_id": None,
        "created_at": now,
        "updated_at": now,
    })

    return sighting_id


def test_get_matches(client, fake_db):
    sighting_id = _create_sighting_with_matches(client, fake_db)

    resp = client.get(f"/api/v1/sightings/{sighting_id}/matches")
    assert resp.status_code == 200
    data = resp.json()
    assert data["sighting_id"] == sighting_id
    assert len(data["candidates"]) == 2
    assert data["candidates"][0]["score"] == 0.95
    assert data["status"] == "pending"


def test_get_matches_not_found(client):
    resp = client.get("/api/v1/sightings/nonexistent/matches")
    assert resp.status_code == 404


def test_submit_feedback_confirm(client, fake_db):
    sighting_id = _create_sighting_with_matches(client, fake_db)

    resp = client.post(
        f"/api/v1/sightings/{sighting_id}/matches/feedback",
        json={"status": "confirmed", "confirmed_profile_id": "profile_abc"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["status"] == "confirmed"
    assert data["confirmed_profile_id"] == "profile_abc"

    # Verify sighting status was also updated
    sighting_resp = client.get(f"/api/v1/sightings/{sighting_id}")
    assert sighting_resp.json()["status"] == "matched"


def test_submit_feedback_reject(client, fake_db):
    sighting_id = _create_sighting_with_matches(client, fake_db)

    resp = client.post(
        f"/api/v1/sightings/{sighting_id}/matches/feedback",
        json={"status": "rejected"},
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "rejected"

    sighting_resp = client.get(f"/api/v1/sightings/{sighting_id}")
    assert sighting_resp.json()["status"] == "no_match"


def test_submit_feedback_no_match_results(client):
    # Create sighting but no match results
    fake_image = _make_test_image()
    create_resp = client.post(
        "/api/v1/sightings",
        data={"latitude": "34.05", "longitude": "-118.25"},
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    sighting_id = create_resp.json()["id"]

    resp = client.post(
        f"/api/v1/sightings/{sighting_id}/matches/feedback",
        json={"status": "confirmed", "confirmed_profile_id": "profile_abc"},
    )
    assert resp.status_code == 404
