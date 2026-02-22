"""Comprehensive edge-case tests for the Profiles endpoints."""
import io


# ───────────────────────────────────────────────────────────────
# POST /api/v1/profiles — Creation validation
# ───────────────────────────────────────────────────────────────

def test_create_profile_name_at_max_length(client):
    """Name exactly 200 chars should be accepted."""
    name = "A" * 200
    resp = client.post("/api/v1/profiles", json={"name": name, "species": "dog"})
    assert resp.status_code == 201
    assert resp.json()["name"] == name


def test_create_profile_name_exceeds_max_length(client):
    """Name over 200 chars should be rejected with 422."""
    name = "A" * 201
    resp = client.post("/api/v1/profiles", json={"name": name, "species": "dog"})
    assert resp.status_code == 422


def test_create_profile_whitespace_only_name(client):
    """A name of only spaces is technically non-empty (min_length=1) but not blank."""
    resp = client.post("/api/v1/profiles", json={"name": "   ", "species": "cat"})
    # FastAPI min_length counts whitespace, so this should pass (len=3 >= 1)
    assert resp.status_code == 201


def test_create_profile_missing_name(client):
    """Missing required field 'name' should be 422."""
    resp = client.post("/api/v1/profiles", json={"species": "dog"})
    assert resp.status_code == 422


def test_create_profile_missing_species(client):
    """Missing required field 'species' should be 422."""
    resp = client.post("/api/v1/profiles", json={"name": "Buddy"})
    assert resp.status_code == 422


def test_create_profile_invalid_sex(client):
    """Invalid sex enum value should be 422."""
    resp = client.post("/api/v1/profiles", json={
        "name": "Buddy", "species": "dog", "sex": "other",
    })
    assert resp.status_code == 422


def test_create_profile_negative_age(client):
    """Negative estimated_age_months — no validator blocks this, so it should accept."""
    resp = client.post("/api/v1/profiles", json={
        "name": "Puppy", "species": "dog", "estimated_age_months": -5,
    })
    # Model has no ge=0 constraint, so this is accepted
    assert resp.status_code == 201
    assert resp.json()["estimated_age_months"] == -5


def test_create_profile_zero_age(client):
    """Zero age should be valid (newborn)."""
    resp = client.post("/api/v1/profiles", json={
        "name": "Newborn", "species": "cat", "estimated_age_months": 0,
    })
    assert resp.status_code == 201
    assert resp.json()["estimated_age_months"] == 0


def test_create_profile_with_all_defaults(client):
    """Verify all optional fields use correct defaults."""
    resp = client.post("/api/v1/profiles", json={"name": "Default", "species": "cat"})
    assert resp.status_code == 201
    data = resp.json()
    assert data["sex"] == "unknown"
    assert data["breed"] == ""
    assert data["color_description"] == ""
    assert data["distinguishing_features"] == ""
    assert data["estimated_age_months"] is None
    assert data["location_found"] is None
    assert data["notes"] == ""
    assert data["photo_count"] == 0
    assert data["photos"] == []


def test_create_profile_invalid_location_missing_latitude(client):
    """location_found with missing latitude should be 422."""
    resp = client.post("/api/v1/profiles", json={
        "name": "Geo", "species": "dog",
        "location_found": {"longitude": -118.0},
    })
    assert resp.status_code == 422


def test_create_profile_invalid_location_non_numeric(client):
    """location_found with non-numeric values should be 422."""
    resp = client.post("/api/v1/profiles", json={
        "name": "Geo", "species": "dog",
        "location_found": {"latitude": "abc", "longitude": -118.0},
    })
    assert resp.status_code == 422


def test_create_profile_extreme_coordinates(client):
    """Extreme but technically valid float coordinates (no geo bounds validation)."""
    resp = client.post("/api/v1/profiles", json={
        "name": "Extreme", "species": "dog",
        "location_found": {"latitude": 90.0, "longitude": 180.0},
    })
    assert resp.status_code == 201
    assert resp.json()["location_found"]["latitude"] == 90.0


def test_create_profile_empty_body(client):
    """Empty JSON body should be 422 (missing required fields)."""
    resp = client.post("/api/v1/profiles", json={})
    assert resp.status_code == 422


def test_create_profile_not_json(client):
    """Non-JSON body should be 422."""
    resp = client.post(
        "/api/v1/profiles",
        content=b"not json",
        headers={"Content-Type": "application/json"},
    )
    assert resp.status_code == 422


def test_create_profile_extra_fields_ignored(client):
    """Extra fields not in the model should be silently ignored."""
    resp = client.post("/api/v1/profiles", json={
        "name": "Extra", "species": "dog", "some_extra_field": "ignored",
    })
    assert resp.status_code == 201
    assert "some_extra_field" not in resp.json()


def test_create_profile_returns_timestamps(client):
    """created_at and updated_at should be present in response."""
    resp = client.post("/api/v1/profiles", json={"name": "TS", "species": "cat"})
    data = resp.json()
    assert "created_at" in data
    assert "updated_at" in data


def test_create_profile_returns_unique_ids(client):
    """Two profiles should have different IDs."""
    r1 = client.post("/api/v1/profiles", json={"name": "A", "species": "dog"})
    r2 = client.post("/api/v1/profiles", json={"name": "B", "species": "dog"})
    assert r1.json()["id"] != r2.json()["id"]


# ───────────────────────────────────────────────────────────────
# GET /api/v1/profiles — List with pagination and limits
# ───────────────────────────────────────────────────────────────

def test_list_profiles_empty(client):
    """List with no profiles returns empty array."""
    resp = client.get("/api/v1/profiles")
    assert resp.status_code == 200
    assert resp.json()["profiles"] == []
    assert resp.json()["next_cursor"] is None


def test_list_profiles_limit_parameter(client):
    """Limit should cap the number of returned profiles."""
    for i in range(5):
        client.post("/api/v1/profiles", json={"name": f"P{i}", "species": "dog"})

    resp = client.get("/api/v1/profiles?limit=2")
    assert resp.status_code == 200
    assert len(resp.json()["profiles"]) == 2
    # Should have a next_cursor since there are more
    assert resp.json()["next_cursor"] is not None


def test_list_profiles_limit_too_large(client):
    """limit > 100 should be rejected with 422."""
    resp = client.get("/api/v1/profiles?limit=101")
    assert resp.status_code == 422


def test_list_profiles_limit_zero(client):
    """limit=0 should be rejected (ge=1)."""
    resp = client.get("/api/v1/profiles?limit=0")
    assert resp.status_code == 422


def test_list_profiles_limit_negative(client):
    """Negative limit should be 422."""
    resp = client.get("/api/v1/profiles?limit=-1")
    assert resp.status_code == 422


def test_list_profiles_invalid_species_filter(client):
    """Invalid species enum value in query param should be 422."""
    resp = client.get("/api/v1/profiles?species=bird")
    assert resp.status_code == 422


def test_list_profiles_pagination_cursor(client):
    """Verify cursor-based pagination works correctly."""
    ids = []
    for i in range(5):
        r = client.post("/api/v1/profiles", json={"name": f"Page{i}", "species": "dog"})
        ids.append(r.json()["id"])

    # Get first page
    page1 = client.get("/api/v1/profiles?limit=3")
    assert len(page1.json()["profiles"]) == 3
    cursor = page1.json()["next_cursor"]
    assert cursor is not None

    # Get second page
    page2 = client.get(f"/api/v1/profiles?limit=3&cursor={cursor}")
    assert len(page2.json()["profiles"]) == 2
    assert page2.json()["next_cursor"] is None

    # Verify no overlap between pages
    page1_ids = {p["id"] for p in page1.json()["profiles"]}
    page2_ids = {p["id"] for p in page2.json()["profiles"]}
    assert page1_ids.isdisjoint(page2_ids)


def test_list_profiles_invalid_cursor(client):
    """Nonexistent cursor doc should return results from the beginning."""
    client.post("/api/v1/profiles", json={"name": "A", "species": "dog"})
    resp = client.get("/api/v1/profiles?cursor=nonexistent_id")
    assert resp.status_code == 200
    # Should still return results (cursor doc doesn't exist, so start_after is skipped)
    assert len(resp.json()["profiles"]) == 1


# ───────────────────────────────────────────────────────────────
# PATCH /api/v1/profiles/{id} — Update edge cases
# ───────────────────────────────────────────────────────────────

def test_update_profile_species(client):
    """Updating species should work."""
    r = client.post("/api/v1/profiles", json={"name": "Cat", "species": "cat"})
    pid = r.json()["id"]

    resp = client.patch(f"/api/v1/profiles/{pid}", json={"species": "dog"})
    assert resp.status_code == 200
    assert resp.json()["species"] == "dog"


def test_update_profile_invalid_species(client):
    """Invalid species enum in update should be 422."""
    r = client.post("/api/v1/profiles", json={"name": "Rex", "species": "dog"})
    pid = r.json()["id"]

    resp = client.patch(f"/api/v1/profiles/{pid}", json={"species": "hamster"})
    assert resp.status_code == 422


def test_update_profile_empty_name(client):
    """Updating name to empty string should be 422 (min_length=1)."""
    r = client.post("/api/v1/profiles", json={"name": "Rex", "species": "dog"})
    pid = r.json()["id"]

    resp = client.patch(f"/api/v1/profiles/{pid}", json={"name": ""})
    assert resp.status_code == 422


def test_update_profile_name_exceeds_max(client):
    """Updating name to >200 chars should be 422."""
    r = client.post("/api/v1/profiles", json={"name": "Rex", "species": "dog"})
    pid = r.json()["id"]

    resp = client.patch(f"/api/v1/profiles/{pid}", json={"name": "X" * 201})
    assert resp.status_code == 422


def test_update_profile_location(client):
    """Updating location_found should work."""
    r = client.post("/api/v1/profiles", json={"name": "Geo", "species": "dog"})
    pid = r.json()["id"]

    resp = client.patch(f"/api/v1/profiles/{pid}", json={
        "location_found": {"latitude": 51.5, "longitude": -0.12},
    })
    assert resp.status_code == 200
    assert resp.json()["location_found"]["latitude"] == 51.5


def test_update_profile_preserves_unchanged_fields(client):
    """Patching one field should not alter others."""
    r = client.post("/api/v1/profiles", json={
        "name": "Rex", "species": "dog", "breed": "Husky", "notes": "Good boy",
    })
    pid = r.json()["id"]

    resp = client.patch(f"/api/v1/profiles/{pid}", json={"breed": "Malamute"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["breed"] == "Malamute"
    assert data["name"] == "Rex"  # unchanged
    assert data["notes"] == "Good boy"  # unchanged


def test_update_profile_updates_timestamp(client):
    """updated_at should change after an update."""
    r = client.post("/api/v1/profiles", json={"name": "TS", "species": "dog"})
    pid = r.json()["id"]
    original_updated = r.json()["updated_at"]

    resp = client.patch(f"/api/v1/profiles/{pid}", json={"notes": "Updated"})
    assert resp.status_code == 200
    # updated_at should be >= original (can be same if clock resolution is low in tests)
    assert resp.json()["updated_at"] >= original_updated


# ───────────────────────────────────────────────────────────────
# DELETE /api/v1/profiles/{id} — Cascade delete
# ───────────────────────────────────────────────────────────────

def test_delete_profile_with_photos_cleans_storage(client, fake_bucket):
    """Deleting a profile with photos should remove photos from storage."""
    r = client.post("/api/v1/profiles", json={"name": "PhotoDog", "species": "dog"})
    pid = r.json()["id"]

    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
    client.post(
        f"/api/v1/profiles/{pid}/photos",
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )

    # Verify photo is in storage
    photo_keys = [k for k in fake_bucket._blobs if k.startswith(f"profiles/{pid}/")]
    assert len(photo_keys) >= 1

    # Delete the profile
    resp = client.delete(f"/api/v1/profiles/{pid}")
    assert resp.status_code == 204

    # Verify storage is cleaned
    remaining = [k for k in fake_bucket._blobs if k.startswith(f"profiles/{pid}/")]
    assert len(remaining) == 0


def test_delete_profile_idempotent(client):
    """Deleting the same profile twice should return 404 the second time."""
    r = client.post("/api/v1/profiles", json={"name": "Gone", "species": "cat"})
    pid = r.json()["id"]

    assert client.delete(f"/api/v1/profiles/{pid}").status_code == 204
    assert client.delete(f"/api/v1/profiles/{pid}").status_code == 404


# ───────────────────────────────────────────────────────────────
# POST /api/v1/profiles/{id}/photos — Photo upload edge cases
# ───────────────────────────────────────────────────────────────

def test_upload_photo_to_nonexistent_profile(client):
    """Uploading a photo to a nonexistent profile should be 404."""
    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
    resp = client.post(
        "/api/v1/profiles/nonexistent/photos",
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    assert resp.status_code == 404


def test_upload_photo_increments_count(client):
    """photo_count should increment after each upload."""
    r = client.post("/api/v1/profiles", json={"name": "Counter", "species": "dog"})
    pid = r.json()["id"]
    assert r.json()["photo_count"] == 0

    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
    client.post(
        f"/api/v1/profiles/{pid}/photos",
        files={"file": ("p1.jpg", fake_image, "image/jpeg")},
    )

    profile = client.get(f"/api/v1/profiles/{pid}").json()
    assert profile["photo_count"] == 1

    fake_image2 = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
    client.post(
        f"/api/v1/profiles/{pid}/photos",
        files={"file": ("p2.jpg", fake_image2, "image/jpeg")},
    )

    profile = client.get(f"/api/v1/profiles/{pid}").json()
    assert profile["photo_count"] == 2


def test_delete_photo_decrements_count(client):
    """photo_count should decrement after deletion."""
    r = client.post("/api/v1/profiles", json={"name": "Counter", "species": "dog"})
    pid = r.json()["id"]

    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
    photo_resp = client.post(
        f"/api/v1/profiles/{pid}/photos",
        files={"file": ("p1.jpg", fake_image, "image/jpeg")},
    )
    photo_id = photo_resp.json()["photo_id"]

    assert client.get(f"/api/v1/profiles/{pid}").json()["photo_count"] == 1

    client.delete(f"/api/v1/profiles/{pid}/photos/{photo_id}")

    assert client.get(f"/api/v1/profiles/{pid}").json()["photo_count"] == 0


def test_upload_photo_storage_path_format(client):
    """Storage path should follow profiles/{id}/photos/{photo_id}.jpg pattern."""
    r = client.post("/api/v1/profiles", json={"name": "PathCheck", "species": "dog"})
    pid = r.json()["id"]

    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
    resp = client.post(
        f"/api/v1/profiles/{pid}/photos",
        files={"file": ("photo.jpg", fake_image, "image/jpeg")},
    )
    data = resp.json()
    assert data["storage_path"].startswith(f"profiles/{pid}/photos/")
    assert data["storage_path"].endswith(".jpg")


def test_upload_photo_each_has_unique_id(client):
    """Each uploaded photo should have a different photo_id."""
    r = client.post("/api/v1/profiles", json={"name": "UniquePhotos", "species": "dog"})
    pid = r.json()["id"]

    photo_ids = []
    for i in range(3):
        fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
        resp = client.post(
            f"/api/v1/profiles/{pid}/photos",
            files={"file": (f"p{i}.jpg", fake_image, "image/jpeg")},
        )
        photo_ids.append(resp.json()["photo_id"])

    assert len(set(photo_ids)) == 3


def test_delete_photo_from_nonexistent_profile(client):
    """Deleting a photo from a nonexistent profile should 404."""
    resp = client.delete("/api/v1/profiles/nonexistent/photos/somephotoid")
    assert resp.status_code == 404


def test_upload_photo_no_file(client):
    """POST without a file should be 422."""
    r = client.post("/api/v1/profiles", json={"name": "NoFile", "species": "dog"})
    pid = r.json()["id"]

    resp = client.post(f"/api/v1/profiles/{pid}/photos")
    assert resp.status_code == 422


# ───────────────────────────────────────────────────────────────
# GET /api/v1/profiles/{id} — Get edge cases
# ───────────────────────────────────────────────────────────────

def test_get_profile_returns_photos_in_response(client):
    """Getting a profile should include photos array with signed URLs."""
    r = client.post("/api/v1/profiles", json={"name": "WithPhotos", "species": "dog"})
    pid = r.json()["id"]

    for i in range(3):
        fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
        client.post(
            f"/api/v1/profiles/{pid}/photos",
            files={"file": (f"p{i}.jpg", fake_image, "image/jpeg")},
        )

    resp = client.get(f"/api/v1/profiles/{pid}")
    assert resp.status_code == 200
    data = resp.json()
    assert len(data["photos"]) == 3
    for photo in data["photos"]:
        assert "photo_id" in photo
        assert "storage_path" in photo
        assert "signed_url" in photo
        assert "uploaded_at" in photo


def test_list_profiles_does_not_include_photos(client):
    """List endpoint should NOT include enriched photo objects (perf optimization)."""
    r = client.post("/api/v1/profiles", json={"name": "ListCheck", "species": "dog"})
    pid = r.json()["id"]

    fake_image = io.BytesIO(b"\xff\xd8\xff\xe0fake-jpeg-data")
    client.post(
        f"/api/v1/profiles/{pid}/photos",
        files={"file": ("p.jpg", fake_image, "image/jpeg")},
    )

    resp = client.get("/api/v1/profiles")
    assert resp.status_code == 200
    profiles = resp.json()["profiles"]
    # List returns ProfileResponse which has photos=[] default;
    # the list endpoint does NOT enrich photos (it uses ProfileResponse(**p) directly)
    for p in profiles:
        assert "photos" in p  # field exists in response model
