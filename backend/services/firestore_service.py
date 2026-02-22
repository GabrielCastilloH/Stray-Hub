from datetime import datetime, timezone

from google.cloud.firestore import Client as FirestoreClient
from google.cloud.firestore_v1 import FieldFilter
from google.cloud.firestore_v1.base_query import BaseQuery

from backend.models.common import GeoPointIn


def _geo_to_firestore(geo: GeoPointIn | None):
    if geo is None:
        return None
    from google.cloud.firestore_v1._helpers import GeoPoint
    return GeoPoint(geo.latitude, geo.longitude)


def _geo_from_firestore(geo) -> GeoPointIn | None:
    if geo is None:
        return None
    return GeoPointIn(latitude=geo.latitude, longitude=geo.longitude)


def _now() -> datetime:
    return datetime.now(timezone.utc)


# --- Profiles ---

def create_profile(db: FirestoreClient, data: dict) -> tuple[str, dict]:
    now = _now()
    doc_data = {
        "name": data["name"],
        "species": data["species"],
        "sex": data.get("sex", "unknown"),
        "breed": data.get("breed", ""),
        "color_description": data.get("color_description", ""),
        "distinguishing_features": data.get("distinguishing_features", ""),
        "estimated_age_months": data.get("estimated_age_months"),
        "location_found": _geo_to_firestore(
            GeoPointIn(**data["location_found"]) if isinstance(data.get("location_found"), dict) else data.get("location_found")
        ),
        "notes": data.get("notes", ""),
        "photo_count": 0,
        "created_at": now,
        "updated_at": now,
    }
    _, doc_ref = db.collection("profiles").add(doc_data)
    doc_data["id"] = doc_ref.id
    doc_data["location_found"] = _geo_from_firestore(doc_data["location_found"])
    doc_data["created_at"] = now
    doc_data["updated_at"] = now
    return doc_ref.id, doc_data


def get_profile(db: FirestoreClient, profile_id: str) -> dict | None:
    doc = db.collection("profiles").document(profile_id).get()
    if not doc.exists:
        return None
    return _profile_doc_to_dict(doc)


def list_profiles(
    db: FirestoreClient,
    species: str | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[dict], str | None]:
    query: BaseQuery = db.collection("profiles").order_by("created_at", direction="DESCENDING")

    if species:
        query = query.where(filter=FieldFilter("species", "==", species))

    if cursor:
        cursor_doc = db.collection("profiles").document(cursor).get()
        if cursor_doc.exists:
            query = query.start_after(cursor_doc)

    docs = list(query.limit(limit + 1).stream())

    next_cursor = None
    if len(docs) > limit:
        next_cursor = docs[limit - 1].id
        docs = docs[:limit]

    return [_profile_doc_to_dict(d) for d in docs], next_cursor


def update_profile(db: FirestoreClient, profile_id: str, data: dict) -> dict | None:
    doc_ref = db.collection("profiles").document(profile_id)
    doc = doc_ref.get()
    if not doc.exists:
        return None

    update_data = {}
    for key, value in data.items():
        if value is not None:
            if key == "location_found":
                update_data[key] = _geo_to_firestore(
                    GeoPointIn(**value) if isinstance(value, dict) else value
                )
            else:
                update_data[key] = value
    update_data["updated_at"] = _now()
    doc_ref.update(update_data)

    return _profile_doc_to_dict(doc_ref.get())


def delete_profile(db: FirestoreClient, profile_id: str) -> bool:
    doc_ref = db.collection("profiles").document(profile_id)
    doc = doc_ref.get()
    if not doc.exists:
        return False

    # Delete photos subcollection
    photos = doc_ref.collection("photos").stream()
    for photo in photos:
        photo.reference.delete()

    doc_ref.delete()
    return True


# --- Profile Photos ---

def add_photo_meta(
    db: FirestoreClient, profile_id: str, photo_id: str, storage_path: str
) -> dict:
    now = _now()
    photo_data = {
        "storage_path": storage_path,
        "uploaded_at": now,
    }
    db.collection("profiles").document(profile_id).collection("photos").document(
        photo_id
    ).set(photo_data)

    # Increment photo_count
    profile_ref = db.collection("profiles").document(profile_id)
    profile_ref.update({"photo_count": firestore_increment(1), "updated_at": now})

    return {"photo_id": photo_id, "storage_path": storage_path, "uploaded_at": now}


def delete_photo_meta(db: FirestoreClient, profile_id: str, photo_id: str) -> str | None:
    photo_ref = (
        db.collection("profiles")
        .document(profile_id)
        .collection("photos")
        .document(photo_id)
    )
    photo_doc = photo_ref.get()
    if not photo_doc.exists:
        return None
    storage_path = photo_doc.to_dict()["storage_path"]
    photo_ref.delete()

    # Decrement photo_count
    profile_ref = db.collection("profiles").document(profile_id)
    profile_ref.update({"photo_count": firestore_increment(-1), "updated_at": _now()})

    return storage_path


def get_profile_photos(db: FirestoreClient, profile_id: str) -> list[dict]:
    photos = (
        db.collection("profiles")
        .document(profile_id)
        .collection("photos")
        .order_by("uploaded_at")
        .stream()
    )
    results = []
    for p in photos:
        data = p.to_dict()
        results.append({
            "photo_id": p.id,
            "storage_path": data["storage_path"],
            "uploaded_at": data["uploaded_at"],
        })
    return results


def firestore_increment(value: int):
    from google.cloud.firestore_v1 import transforms
    return transforms.Increment(value)


# --- Sightings ---

def create_sighting(
    db: FirestoreClient, sighting_id: str, storage_path: str, data: dict,
) -> tuple[str, dict]:
    now = _now()
    doc_data = {
        "photo_storage_path": storage_path,
        "photo_resized_storage_path": data.get("photo_resized_storage_path", ""),
        "location": _geo_to_firestore(
            GeoPointIn(**data["location"]) if isinstance(data.get("location"), dict) else data.get("location")
        ),
        "notes": data.get("notes", ""),
        "disease_tags": data.get("disease_tags", []),
        "image_width": data.get("image_width"),
        "image_height": data.get("image_height"),
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    doc_ref = db.collection("sightings").document(sighting_id)
    doc_ref.set(doc_data)
    result = {
        "id": sighting_id,
        "photo_storage_path": storage_path,
        "photo_resized_storage_path": doc_data["photo_resized_storage_path"],
        "location": _geo_from_firestore(doc_data["location"]),
        "notes": doc_data["notes"],
        "disease_tags": doc_data["disease_tags"],
        "image_width": doc_data["image_width"],
        "image_height": doc_data["image_height"],
        "status": "pending",
        "created_at": now,
        "updated_at": now,
    }
    return sighting_id, result


def get_sighting(db: FirestoreClient, sighting_id: str) -> dict | None:
    doc = db.collection("sightings").document(sighting_id).get()
    if not doc.exists:
        return None
    return _sighting_doc_to_dict(doc)


def list_sightings(
    db: FirestoreClient,
    status: str | None = None,
    cursor: str | None = None,
    limit: int = 20,
) -> tuple[list[dict], str | None]:
    query: BaseQuery = db.collection("sightings").order_by("created_at", direction="DESCENDING")

    if status:
        query = query.where(filter=FieldFilter("status", "==", status))

    if cursor:
        cursor_doc = db.collection("sightings").document(cursor).get()
        if cursor_doc.exists:
            query = query.start_after(cursor_doc)

    docs = list(query.limit(limit + 1).stream())

    next_cursor = None
    if len(docs) > limit:
        next_cursor = docs[limit - 1].id
        docs = docs[:limit]

    return [_sighting_doc_to_dict(d) for d in docs], next_cursor


# --- Matches ---

def get_match_result(db: FirestoreClient, sighting_id: str) -> dict | None:
    doc = db.collection("matches").document(sighting_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    return {
        "sighting_id": doc.id,
        "candidates": data.get("candidates", []),
        "status": data.get("status", "pending"),
        "confirmed_profile_id": data.get("confirmed_profile_id"),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
    }


def update_match_feedback(
    db: FirestoreClient, sighting_id: str, status: str, confirmed_profile_id: str | None
) -> dict | None:
    doc_ref = db.collection("matches").document(sighting_id)
    doc = doc_ref.get()
    if not doc.exists:
        return None

    now = _now()
    update_data = {"status": status, "updated_at": now}
    if confirmed_profile_id is not None:
        update_data["confirmed_profile_id"] = confirmed_profile_id

    doc_ref.update(update_data)

    # Also update the sighting status
    sighting_status = "matched" if status == "confirmed" else "no_match"
    db.collection("sightings").document(sighting_id).update({
        "status": sighting_status,
        "updated_at": now,
    })

    return get_match_result(db, sighting_id)


# --- Helpers ---

def _profile_doc_to_dict(doc) -> dict:
    data = doc.to_dict()
    return {
        "id": doc.id,
        "name": data.get("name", ""),
        "species": data.get("species", "dog"),
        "sex": data.get("sex", "unknown"),
        "breed": data.get("breed", ""),
        "color_description": data.get("color_description", ""),
        "distinguishing_features": data.get("distinguishing_features", ""),
        "estimated_age_months": data.get("estimated_age_months"),
        "location_found": _geo_from_firestore(data.get("location_found")),
        "notes": data.get("notes", ""),
        "photo_count": data.get("photo_count", 0),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
    }


def update_sighting_embedding(
    db: FirestoreClient, sighting_id: str, embedding: list[float], model_version: str,
) -> None:
    db.collection("sightings").document(sighting_id).update({
        "embedding": embedding,
        "model_version": model_version,
        "updated_at": _now(),
    })


def create_sighting_multi(
    db: FirestoreClient,
    sighting_id: str,
    photo_paths: list[str],
    resized_paths: list[str],
    data: dict,
) -> tuple[str, dict]:
    """Create a sighting with multiple photo paths."""
    now = _now()
    doc_data = {
        "photo_storage_path": photo_paths[0] if photo_paths else "",
        "photo_storage_paths": photo_paths,
        "photo_resized_storage_path": resized_paths[0] if resized_paths else "",
        "photo_resized_storage_paths": resized_paths,
        "location": _geo_to_firestore(
            GeoPointIn(**data["location"]) if isinstance(data.get("location"), dict) else data.get("location")
        ),
        "notes": data.get("notes", ""),
        "disease_tags": data.get("disease_tags", []),
        "image_width": 224,
        "image_height": 224,
        "embedding": data.get("embedding"),
        "model_version": data.get("model_version"),
        "status": data.get("status", "pending"),
        "created_at": now,
        "updated_at": now,
    }
    doc_ref = db.collection("sightings").document(sighting_id)
    doc_ref.set(doc_data)
    result = {
        "id": sighting_id,
        "photo_storage_paths": photo_paths,
        "photo_resized_storage_paths": resized_paths,
        "photo_storage_path": doc_data["photo_storage_path"],
        "photo_resized_storage_path": doc_data["photo_resized_storage_path"],
        "location": _geo_from_firestore(doc_data["location"]),
        "notes": doc_data["notes"],
        "disease_tags": doc_data["disease_tags"],
        "image_width": 224,
        "image_height": 224,
        "embedding": doc_data["embedding"],
        "model_version": doc_data["model_version"],
        "status": doc_data["status"],
        "created_at": now,
        "updated_at": now,
    }
    return sighting_id, result


def list_sightings_with_embeddings(
    db: FirestoreClient, exclude_id: str,
) -> list[dict]:
    """Fetch all sightings that have a non-null embedding, excluding the given ID."""
    docs = db.collection("sightings").stream()
    results = []
    for doc in docs:
        if doc.id == exclude_id:
            continue
        data = doc.to_dict()
        embedding = data.get("embedding")
        if embedding is not None and len(embedding) > 0:
            results.append(_sighting_doc_to_dict(doc))
    return results


def create_match_result(
    db: FirestoreClient, sighting_id: str, candidates: list[dict],
) -> dict:
    """Write a match result document to matches/{sighting_id}."""
    now = _now()
    doc_data = {
        "sighting_id": sighting_id,
        "candidates": candidates,
        "status": "pending",
        "confirmed_profile_id": None,
        "created_at": now,
        "updated_at": now,
    }
    db.collection("matches").document(sighting_id).set(doc_data)
    return doc_data


def update_sighting_status(
    db: FirestoreClient, sighting_id: str, status: str,
) -> None:
    """Update the status field of a sighting."""
    db.collection("sightings").document(sighting_id).update({
        "status": status,
        "updated_at": _now(),
    })


def _sighting_doc_to_dict(doc) -> dict:
    data = doc.to_dict()
    return {
        "id": doc.id,
        "photo_storage_path": data.get("photo_storage_path", ""),
        "photo_resized_storage_path": data.get("photo_resized_storage_path", ""),
        "location": _geo_from_firestore(data.get("location")),
        "notes": data.get("notes", ""),
        "disease_tags": data.get("disease_tags", []),
        "image_width": data.get("image_width"),
        "image_height": data.get("image_height"),
        "embedding": data.get("embedding"),
        "model_version": data.get("model_version"),
        "status": data.get("status", "pending"),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
    }
