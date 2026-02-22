import io

from PIL import Image


def _make_test_image(width: int = 640, height: int = 480) -> io.BytesIO:
    """Create a valid JPEG image in memory for testing."""
    img = Image.new("RGB", (width, height), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


def test_create_profile(client):
    resp = client.post("/api/v1/profiles", json={
        "species": "dog",
        "sex": "male",
        "breed": "Labrador",
        "color_description": "Golden",
        "distinguishing_features": "Scar on left ear",
        "estimated_age_months": 24,
        "location_found": {"latitude": 34.05, "longitude": -118.25},
        "notes": "Friendly",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"].startswith("Dog #")
    assert data["species"] == "dog"
    assert data["sex"] == "male"
    assert data["photo_count"] == 0
    assert data["id"]
    assert data["location_found"]["latitude"] == 34.05


def test_create_profile_minimal(client):
    resp = client.post("/api/v1/profiles", json={
        "species": "cat",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"].startswith("Dog #")
    assert data["sex"] == "unknown"
    assert data["photo_count"] == 0


def test_create_profile_invalid_species(client):
    resp = client.post("/api/v1/profiles", json={
        "species": "bird",
    })
    assert resp.status_code == 422


def test_get_profile(client):
    create_resp = client.post("/api/v1/profiles", json={
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    resp = client.get(f"/api/v1/profiles/{profile_id}")
    assert resp.status_code == 200
    assert resp.json()["name"].startswith("Dog #")
    assert resp.json()["photos"] == []


def test_get_profile_not_found(client):
    resp = client.get("/api/v1/profiles/nonexistent")
    assert resp.status_code == 404


def test_list_profiles(client):
    client.post("/api/v1/profiles", json={"species": "dog"})
    client.post("/api/v1/profiles", json={"species": "cat"})
    client.post("/api/v1/profiles", json={"species": "dog"})

    resp = client.get("/api/v1/profiles")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["profiles"]) == 3


def test_list_profiles_filter_species(client):
    client.post("/api/v1/profiles", json={"species": "dog"})
    client.post("/api/v1/profiles", json={"species": "cat"})
    client.post("/api/v1/profiles", json={"species": "dog"})

    resp = client.get("/api/v1/profiles?species=cat")
    assert resp.status_code == 200
    profiles = resp.json()["profiles"]
    assert len(profiles) == 1
    assert profiles[0]["species"] == "cat"


def test_update_profile(client):
    create_resp = client.post("/api/v1/profiles", json={
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    resp = client.patch(f"/api/v1/profiles/{profile_id}", json={
        "breed": "Poodle",
    })
    assert resp.status_code == 200
    assert resp.json()["breed"] == "Poodle"


def test_update_profile_no_fields(client):
    create_resp = client.post("/api/v1/profiles", json={
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    resp = client.patch(f"/api/v1/profiles/{profile_id}", json={})
    assert resp.status_code == 400


def test_update_profile_not_found(client):
    resp = client.patch("/api/v1/profiles/nonexistent", json={"breed": "Poodle"})
    assert resp.status_code == 404


def test_delete_profile(client):
    create_resp = client.post("/api/v1/profiles", json={
        "species": "cat",
    })
    profile_id = create_resp.json()["id"]

    resp = client.delete(f"/api/v1/profiles/{profile_id}")
    assert resp.status_code == 204

    resp = client.get(f"/api/v1/profiles/{profile_id}")
    assert resp.status_code == 404


def test_delete_profile_not_found(client):
    resp = client.delete("/api/v1/profiles/nonexistent")
    assert resp.status_code == 404


def test_upload_photo(client):
    create_resp = client.post("/api/v1/profiles", json={
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    fake_image = _make_test_image()
    resp = client.post(
        f"/api/v1/profiles/{profile_id}/photos",
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["photo_id"]
    assert data["storage_path"].startswith(f"profiles/{profile_id}/photos/")
    assert data["signed_url"]


def test_upload_5_photos_then_reject_6th(client):
    create_resp = client.post("/api/v1/profiles", json={
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    for i in range(5):
        fake_image = _make_test_image()
        resp = client.post(
            f"/api/v1/profiles/{profile_id}/photos",
            files={"file": (f"photo{i}.jpg", fake_image, "image/jpeg")},
        )
        assert resp.status_code == 201, f"Photo {i} upload failed: {resp.json()}"

    # 6th photo should be rejected
    fake_image = _make_test_image()
    resp = client.post(
        f"/api/v1/profiles/{profile_id}/photos",
        files={"file": ("photo5.jpg", fake_image, "image/jpeg")},
    )
    assert resp.status_code == 400
    assert "Maximum" in resp.json()["detail"]


def test_get_profile_with_photos(client):
    create_resp = client.post("/api/v1/profiles", json={
        "species": "cat",
    })
    profile_id = create_resp.json()["id"]

    fake_image = _make_test_image()
    client.post(
        f"/api/v1/profiles/{profile_id}/photos",
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )

    resp = client.get(f"/api/v1/profiles/{profile_id}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["photos"]) == 1
    assert data["photos"][0]["signed_url"]


def test_delete_photo(client):
    create_resp = client.post("/api/v1/profiles", json={
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    fake_image = _make_test_image()
    photo_resp = client.post(
        f"/api/v1/profiles/{profile_id}/photos",
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    photo_id = photo_resp.json()["photo_id"]

    resp = client.delete(f"/api/v1/profiles/{profile_id}/photos/{photo_id}")
    assert resp.status_code == 204

    # Verify photo is gone
    resp = client.get(f"/api/v1/profiles/{profile_id}")
    assert resp.json()["photos"] == []


def test_delete_photo_not_found(client):
    create_resp = client.post("/api/v1/profiles", json={
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    resp = client.delete(f"/api/v1/profiles/{profile_id}/photos/nonexistent")
    assert resp.status_code == 404


# ───────────────────────────────────────────────────────────────
# POST /api/v1/profiles/{id}/confirm-sighting
# ───────────────────────────────────────────────────────────────


def test_confirm_sighting_appends_to_profile(client):
    """Confirming a sighting appends {timestamp, location} to profile.sightings."""
    create_resp = client.post("/api/v1/profiles", json={
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    resp = client.post(
        f"/api/v1/profiles/{profile_id}/confirm-sighting",
        json={"latitude": 34.05, "longitude": -118.25},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["sightings"]) == 1
    assert data["sightings"][0]["location"]["latitude"] == 34.05
    assert data["sightings"][0]["location"]["longitude"] == -118.25
    assert "timestamp" in data["sightings"][0]
    assert data["last_seen_location"]["latitude"] == 34.05
    assert data["last_seen_at"] is not None


def test_confirm_sighting_appends_multiple(client):
    """Multiple confirmations append multiple sighting entries."""
    create_resp = client.post("/api/v1/profiles", json={
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    client.post(
        f"/api/v1/profiles/{profile_id}/confirm-sighting",
        json={"latitude": 34.0, "longitude": -118.0},
    )
    resp = client.post(
        f"/api/v1/profiles/{profile_id}/confirm-sighting",
        json={"latitude": 35.0, "longitude": -119.0},
    )
    assert resp.status_code == 200
    assert len(resp.json()["sightings"]) == 2


def test_confirm_sighting_profile_not_found(client):
    """Confirming sighting for nonexistent profile returns 404."""
    resp = client.post(
        "/api/v1/profiles/nonexistent/confirm-sighting",
        json={"latitude": 34.0, "longitude": -118.0},
    )
    assert resp.status_code == 404


def test_confirm_sighting_invalid_body(client):
    """Missing latitude or longitude returns 422."""
    create_resp = client.post("/api/v1/profiles", json={"species": "dog"})
    profile_id = create_resp.json()["id"]

    resp = client.post(
        f"/api/v1/profiles/{profile_id}/confirm-sighting",
        json={"latitude": 34.0},
    )
    assert resp.status_code == 422
