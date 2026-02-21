import io

from PIL import Image


def _make_test_image(width=640, height=480) -> io.BytesIO:
    """Create a valid JPEG image in memory for testing."""
    img = Image.new("RGB", (width, height), color=(128, 64, 32))
    buf = io.BytesIO()
    img.save(buf, format="JPEG")
    buf.seek(0)
    return buf


def test_create_sighting(client):
    fake_image = _make_test_image()
    resp = client.post(
        "/api/v1/sightings",
        data={"latitude": "34.05", "longitude": "-118.25", "notes": "Spotted near park"},
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["id"]
    assert data["status"] == "pending"
    assert data["location"]["latitude"] == 34.05
    assert data["notes"] == "Spotted near park"
    assert data["photo_storage_path"]
    assert data["photo_signed_url"]
    # New fields
    assert data["photo_resized_storage_path"].endswith("photo_224.jpg")
    assert data["image_width"] == 224
    assert data["image_height"] == 224
    assert data["disease_tags"] == []


def test_create_sighting_with_disease_tags(client):
    fake_image = _make_test_image()
    resp = client.post(
        "/api/v1/sightings",
        data={
            "latitude": "34.05",
            "longitude": "-118.25",
            "disease_tags": "rabies,mange",
        },
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert set(data["disease_tags"]) == {"rabies", "mange"}


def test_create_sighting_minimal(client):
    fake_image = _make_test_image()
    resp = client.post(
        "/api/v1/sightings",
        data={"latitude": "0.0", "longitude": "0.0"},
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    assert resp.status_code == 201
    assert resp.json()["notes"] == ""
    assert resp.json()["disease_tags"] == []


def test_resized_image_stored(client, fake_bucket):
    """Verify that both original and 224x224 resized images are stored."""
    fake_image = _make_test_image(800, 600)
    resp = client.post(
        "/api/v1/sightings",
        data={"latitude": "1.0", "longitude": "2.0"},
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    assert resp.status_code == 201
    data = resp.json()
    sighting_id = data["id"]

    original_path = f"sightings/{sighting_id}/photo.jpg"
    resized_path = f"sightings/{sighting_id}/photo_224.jpg"

    assert original_path in fake_bucket._blobs
    assert resized_path in fake_bucket._blobs

    # Verify the resized image is actually 224x224
    resized_bytes = fake_bucket._blobs[resized_path]
    resized_img = Image.open(io.BytesIO(resized_bytes))
    assert resized_img.size == (224, 224)


def test_list_sightings(client):
    for i in range(3):
        fake_image = _make_test_image()
        client.post(
            "/api/v1/sightings",
            data={"latitude": str(i), "longitude": str(i)},
            files={"file": (f"photo{i}.jpg", fake_image, "image/jpeg")},
        )

    resp = client.get("/api/v1/sightings")
    assert resp.status_code == 200
    assert len(resp.json()["sightings"]) == 3


def test_get_sighting(client):
    fake_image = _make_test_image()
    create_resp = client.post(
        "/api/v1/sightings",
        data={"latitude": "34.05", "longitude": "-118.25"},
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    sighting_id = create_resp.json()["id"]

    resp = client.get(f"/api/v1/sightings/{sighting_id}")
    assert resp.status_code == 200
    assert resp.json()["id"] == sighting_id


def test_get_sighting_not_found(client):
    resp = client.get("/api/v1/sightings/nonexistent")
    assert resp.status_code == 404
