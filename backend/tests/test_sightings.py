import io


def test_create_sighting(client):
    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
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


def test_create_sighting_minimal(client):
    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
    resp = client.post(
        "/api/v1/sightings",
        data={"latitude": "0.0", "longitude": "0.0"},
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    assert resp.status_code == 201
    assert resp.json()["notes"] == ""


def test_list_sightings(client):
    for i in range(3):
        fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
        client.post(
            "/api/v1/sightings",
            data={"latitude": str(i), "longitude": str(i)},
            files={"file": (f"photo{i}.jpg", fake_image, "image/jpeg")},
        )

    resp = client.get("/api/v1/sightings")
    assert resp.status_code == 200
    assert len(resp.json()["sightings"]) == 3


def test_get_sighting(client):
    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
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
