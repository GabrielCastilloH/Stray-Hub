import uuid
from datetime import datetime, timezone

from google.cloud.firestore import Client as FirestoreClient
from google.cloud.firestore_v1 import FieldFilter
from google.cloud.firestore_v1.base_query import BaseQuery
from google.cloud.firestore_v1.transaction import transactional

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
    profile_id = uuid.uuid4().hex
    from google.cloud.firestore_v1 import transforms as _fs
    counter_ref = db.collection("counters").document("profiles")
    counter_ref.set({"count": _fs.Increment(1)}, merge=True)
    counter_snap = counter_ref.get()
    profile_number = counter_snap.to_dict().get("count", 1) if counter_snap.exists else 1
    doc_data = {
        "name": f"Dog #{profile_number}",
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
        "face_photo_id": None,
        "has_embedding": False,
        "profile_number": profile_number,
        "created_at": now,
        "updated_at": now,
    }
    db.collection("profiles").document(profile_id).set(doc_data)
    doc_data["id"] = profile_id
    doc_data["location_found"] = _geo_from_firestore(doc_data["location_found"])
    return profile_id, doc_data


def create_profile_from_intake(db: FirestoreClient, profile_id: str, data: dict) -> tuple[str, dict]:
    """Create a profile with vet intake fields (used by POST /profiles/intake)."""
    now = _now()
    counter_ref = db.collection("counters").document("profiles")
    profile_ref = db.collection("profiles").document(profile_id)
    location_found = (
        _geo_to_firestore(
            GeoPointIn(**data["location_found"])
            if isinstance(data.get("location_found"), dict)
            else data.get("location_found")
        )
        if data.get("location_found") is not None
        else None
    )

    @transactional
    def _do_create(transaction):
        counter_snap = counter_ref.get(transaction=transaction)
        current_count = (
            counter_snap.to_dict().get("count", 0) if counter_snap.exists else 0
        )
        next_num = current_count + 1
        transaction.set(counter_ref, {"count": next_num}, merge=True)
        doc_data = {
            "name": f"Dog #{next_num}",
            "species": data.get("species", "dog"),
            "sex": data.get("sex", "unknown"),
            "breed": data.get("breed", ""),
            "color_description": data.get("color_description", ""),
            "distinguishing_features": data.get("distinguishing_features", ""),
            "estimated_age_months": data.get("estimated_age_months"),
            "location_found": location_found,
            "notes": data.get("notes", ""),
            "photo_count": 0,
            "age_estimate": data.get("age_estimate", ""),
            "primary_color": data.get("primary_color", ""),
            "microchip_id": data.get("microchip_id", ""),
            "collar_tag_id": data.get("collar_tag_id", ""),
            "neuter_status": data.get("neuter_status", ""),
            "surgery_date": data.get("surgery_date", ""),
            "rabies": data.get("rabies", {}),
            "dhpp": data.get("dhpp", {}),
            "bite_risk": data.get("bite_risk", ""),
            "diseases": data.get("diseases", []),
            "clinic_name": data.get("clinic_name", ""),
            "intake_location": data.get("intake_location", ""),
            "release_location": data.get("release_location", ""),
            "face_photo_id": None,
            "has_embedding": False,
            "sightings": [],
            "last_seen_location": None,
            "last_seen_at": None,
            "profile_number": next_num,
            "created_at": now,
            "updated_at": now,
        }
        transaction.set(profile_ref, doc_data)

    transaction = db.transaction()
    _do_create(transaction)

    result = _profile_doc_to_dict(profile_ref.get())
    return profile_id, result


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
    db: FirestoreClient,
    profile_id: str,
    photo_id: str,
    storage_path: str,
    angle: str | None = None,
) -> dict:
    now = _now()
    photo_data = {
        "storage_path": storage_path,
        "uploaded_at": now,
    }
    if angle:
        photo_data["angle"] = angle
    db.collection("profiles").document(profile_id).collection("photos").document(
        photo_id
    ).set(photo_data)

    profile_update: dict = {"photo_count": firestore_increment(1), "updated_at": now}
    if angle == "face":
        profile_update["face_photo_id"] = photo_id

    db.collection("profiles").document(profile_id).update(profile_update)

    return {"photo_id": photo_id, "storage_path": storage_path, "uploaded_at": now, "angle": angle}


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
    photo_data = photo_doc.to_dict()
    storage_path = photo_data["storage_path"]
    was_face = photo_data.get("angle") == "face"
    photo_ref.delete()

    profile_update: dict = {"photo_count": firestore_increment(-1), "updated_at": _now()}
    if was_face:
        profile_update["face_photo_id"] = None

    db.collection("profiles").document(profile_id).update(profile_update)

    return storage_path


def get_profile_face_photo_path(db: FirestoreClient, profile_id: str) -> str | None:
    """Return storage path of the face photo.

    Derives path from face_photo_id (O(1)). Falls back to first photo in subcollection
    for legacy profiles that may not have face_photo_id set.
    """
    doc = db.collection("profiles").document(profile_id).get()
    if not doc.exists:
        return None
    data = doc.to_dict()
    face_photo_id = data.get("face_photo_id") or data.get("face_photo_path")
    if face_photo_id:
        # Legacy: face_photo_path stored the full path; new: face_photo_id is just the UUID
        if face_photo_id.startswith("profiles/"):
            return face_photo_id
        return f"profiles/{profile_id}/photos/{face_photo_id}.jpg"
    # Fallback: first photo in subcollection
    photos = (
        db.collection("profiles")
        .document(profile_id)
        .collection("photos")
        .order_by("uploaded_at")
        .limit(1)
        .stream()
    )
    for p in photos:
        return f"profiles/{profile_id}/photos/{p.id}.jpg"
    return None


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
            "angle": data.get("angle"),
        })
    return results


def firestore_increment(value: int):
    from google.cloud.firestore_v1 import transforms
    return transforms.Increment(value)


# --- Profile helpers (embeddings, sightings) ---

def list_profiles_with_embeddings(db: FirestoreClient) -> list[dict]:
    """Fetch only profiles that have a stored embedding (for search matching).

    Uses has_embedding==True index filter instead of a full collection scan.
    Profiles created before this field existed fall back to the Python filter.
    """
    docs = (
        db.collection("profiles")
        .where(filter=FieldFilter("has_embedding", "==", True))
        .stream()
    )
    return [_profile_doc_to_dict(doc) for doc in docs]


def add_sighting_to_profile(
    db: FirestoreClient, profile_id: str, latitude: float, longitude: float
) -> dict | None:
    """Append a sighting entry to profile's sightings array and update last_seen."""
    doc_ref = db.collection("profiles").document(profile_id)
    doc = doc_ref.get()
    if not doc.exists:
        return None

    now = _now()
    geo = _geo_to_firestore(GeoPointIn(latitude=latitude, longitude=longitude))
    entry = {"timestamp": now, "location": geo}

    from google.cloud.firestore_v1 import ArrayUnion
    doc_ref.update({
        "sightings": ArrayUnion([entry]),
        "last_seen_location": geo,
        "last_seen_at": now,
        "updated_at": now,
    })
    return _profile_doc_to_dict(doc_ref.get())


def update_profile_embedding(
    db: FirestoreClient, profile_id: str, embedding: list[float], model_version: str,
) -> None:
    """Store embedding and model_version on a profile (from vet intake face photo)."""
    db.collection("profiles").document(profile_id).update({
        "embedding": embedding,
        "model_version": model_version,
        "has_embedding": True,
        "updated_at": _now(),
    })


# --- Helpers ---

def _profile_doc_to_dict(doc) -> dict:
    data = doc.to_dict()
    sightings_raw = data.get("sightings") or []
    sightings = []
    for s in sightings_raw:
        loc = s.get("location")
        ts = s.get("timestamp")
        if loc is not None and ts is not None:
            geo = _geo_from_firestore(loc) if hasattr(loc, "latitude") else GeoPointIn(**loc)
            sightings.append({"timestamp": ts, "location": geo})
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
        "face_photo_id": data.get("face_photo_id"),
        "created_at": data["created_at"],
        "updated_at": data["updated_at"],
        "embedding": data.get("embedding"),
        "model_version": data.get("model_version"),
        "has_embedding": data.get("has_embedding", False),
        "sightings": sightings,
        "last_seen_location": _geo_from_firestore(data.get("last_seen_location")),
        "last_seen_at": data.get("last_seen_at"),
        "age_estimate": data.get("age_estimate", ""),
        "primary_color": data.get("primary_color", ""),
        "microchip_id": data.get("microchip_id", ""),
        "collar_tag_id": data.get("collar_tag_id", ""),
        "neuter_status": data.get("neuter_status", ""),
        "surgery_date": data.get("surgery_date", ""),
        "rabies": data.get("rabies", {}),
        "dhpp": data.get("dhpp", {}),
        "bite_risk": data.get("bite_risk", ""),
        "diseases": data.get("diseases", []),
        "clinic_name": data.get("clinic_name", ""),
        "intake_location": data.get("intake_location", ""),
        "release_location": data.get("release_location", ""),
        "profile_number": data.get("profile_number"),
    }
