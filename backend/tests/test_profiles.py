import io


def test_create_profile(client):
    resp = client.post("/api/v1/profiles", json={
        "name": "Buddy",
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
    assert data["name"] == "Buddy"
    assert data["species"] == "dog"
    assert data["sex"] == "male"
    assert data["photo_count"] == 0
    assert data["id"]
    assert data["location_found"]["latitude"] == 34.05


def test_create_profile_minimal(client):
    resp = client.post("/api/v1/profiles", json={
        "name": "Stray Cat",
        "species": "cat",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "Stray Cat"
    assert data["sex"] == "unknown"
    assert data["photo_count"] == 0


def test_create_profile_invalid_species(client):
    resp = client.post("/api/v1/profiles", json={
        "name": "Bird",
        "species": "bird",
    })
    assert resp.status_code == 422


def test_create_profile_empty_name(client):
    resp = client.post("/api/v1/profiles", json={
        "name": "",
        "species": "dog",
    })
    assert resp.status_code == 422


def test_get_profile(client):
    create_resp = client.post("/api/v1/profiles", json={
        "name": "Rex",
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    resp = client.get(f"/api/v1/profiles/{profile_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "Rex"
    assert resp.json()["photos"] == []


def test_get_profile_not_found(client):
    resp = client.get("/api/v1/profiles/nonexistent")
    assert resp.status_code == 404


def test_list_profiles(client):
    client.post("/api/v1/profiles", json={"name": "A", "species": "dog"})
    client.post("/api/v1/profiles", json={"name": "B", "species": "cat"})
    client.post("/api/v1/profiles", json={"name": "C", "species": "dog"})

    resp = client.get("/api/v1/profiles")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["profiles"]) == 3


def test_list_profiles_filter_species(client):
    client.post("/api/v1/profiles", json={"name": "Dog1", "species": "dog"})
    client.post("/api/v1/profiles", json={"name": "Cat1", "species": "cat"})
    client.post("/api/v1/profiles", json={"name": "Dog2", "species": "dog"})

    resp = client.get("/api/v1/profiles?species=cat")
    assert resp.status_code == 200
    profiles = resp.json()["profiles"]
    assert len(profiles) == 1
    assert profiles[0]["species"] == "cat"


def test_update_profile(client):
    create_resp = client.post("/api/v1/profiles", json={
        "name": "Old Name",
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    resp = client.patch(f"/api/v1/profiles/{profile_id}", json={
        "name": "New Name",
        "breed": "Poodle",
    })
    assert resp.status_code == 200
    assert resp.json()["name"] == "New Name"
    assert resp.json()["breed"] == "Poodle"


def test_update_profile_no_fields(client):
    create_resp = client.post("/api/v1/profiles", json={
        "name": "Test",
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    resp = client.patch(f"/api/v1/profiles/{profile_id}", json={})
    assert resp.status_code == 400


def test_update_profile_not_found(client):
    resp = client.patch("/api/v1/profiles/nonexistent", json={"name": "X"})
    assert resp.status_code == 404


def test_delete_profile(client):
    create_resp = client.post("/api/v1/profiles", json={
        "name": "ToDelete",
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
        "name": "PhotoDog",
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
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
        "name": "FivePhotos",
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    for i in range(5):
        fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
        resp = client.post(
            f"/api/v1/profiles/{profile_id}/photos",
            files={"file": (f"photo{i}.jpg", fake_image, "image/jpeg")},
        )
        assert resp.status_code == 201, f"Photo {i} upload failed: {resp.json()}"

    # 6th photo should be rejected
    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
    resp = client.post(
        f"/api/v1/profiles/{profile_id}/photos",
        files={"file": ("photo5.jpg", fake_image, "image/jpeg")},
    )
    assert resp.status_code == 400
    assert "Maximum" in resp.json()["detail"]


def test_get_profile_with_photos(client):
    create_resp = client.post("/api/v1/profiles", json={
        "name": "WithPhotos",
        "species": "cat",
    })
    profile_id = create_resp.json()["id"]

    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
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
        "name": "DeletePhoto",
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
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
        "name": "NoPhoto",
        "species": "dog",
    })
    profile_id = create_resp.json()["id"]

    resp = client.delete(f"/api/v1/profiles/{profile_id}/photos/nonexistent")
    assert resp.status_code == 404
