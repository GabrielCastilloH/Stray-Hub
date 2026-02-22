#!/usr/bin/env python3
"""
Delete all profiles (Firestore + Storage), then rebuild from local photos in tmp/photos.

For each photo: extract sighting_id from filename (part before first '_'),
fetch sighting doc from Firestore for embedding/model_version/location,
create profile with random vet intake data, upload local photo to profiles storage.

Run from project root. Uses .env for credentials.
"""
import sys
import uuid
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from google.cloud.firestore_v1._helpers import GeoPoint

from backend.dependencies import get_firestore_client, get_storage_bucket
from backend.services import firestore_service, storage_service

PHOTOS_DIR = Path(__file__).resolve().parent.parent / "tmp" / "photos"

# Realistic random data for vet intake fields
DOG_NAMES = [
    "Buddy", "Luna", "Max", "Bella", "Charlie", "Daisy", "Cooper", "Sadie",
    "Rocky", "Molly", "Bear", "Lucy", "Duke", "Zoey", "Tucker", "Lola", "Jack",
]
SEX_VALUES = ["male", "female", "unknown"]
AGE_ESTIMATES = ["puppy", "young", "adult", "senior", "unknown"]
PRIMARY_COLORS = ["black", "brown", "tan", "white", "mixed", "gray", "golden"]
NEUTER_STATUSES = ["neutered", "spayed", "intact", "unknown"]
BITE_RISKS = ["low", "medium", "high", "unknown"]
CLINIC_NAMES = ["Community Vet Clinic", "Animal Care Center", "Stray Rescue Clinic", "Hope Veterinary"]
DISEASES_OPTIONS = [
    [],
    [{"name": "rabies", "status": "vaccinated"}],
    [{"name": "mange", "status": "treated"}],
    [{"name": "distemper", "status": "monitored"}],
    [{"name": "parvovirus", "status": "treated"}],
]


def _random_vet_intake_data(seed: int) -> dict:
    """Generate realistic random vet intake fields. seed ensures reproducibility."""
    import random
    rng = random.Random(seed)
    name = rng.choice(DOG_NAMES)
    sex = rng.choice(SEX_VALUES)
    age = rng.choice(AGE_ESTIMATES)
    primary_color = rng.choice(PRIMARY_COLORS)
    neuter_status = rng.choice(NEUTER_STATUSES)
    bite_risk = rng.choice(BITE_RISKS)
    clinic = rng.choice(CLINIC_NAMES)
    diseases = rng.choice(DISEASES_OPTIONS)
    rabies = {"status": "vaccinated", "date": "2024-01-15"} if rng.random() > 0.3 else {}
    dhpp = {"status": "vaccinated", "date": "2024-01-15"} if rng.random() > 0.4 else {}
    return {
        "name": name,
        "sex": sex,
        "age_estimate": age,
        "primary_color": primary_color,
        "neuter_status": neuter_status,
        "bite_risk": bite_risk,
        "clinic_name": clinic,
        "diseases": diseases,
        "rabies": rabies,
        "dhpp": dhpp,
        "intake_location": f"Intake Site {rng.randint(1, 5)}",
        "release_location": f"Release Zone {rng.randint(1, 3)}",
    }


def _geo_to_firestore(lat: float | None, lng: float | None):
    if lat is None or lng is None:
        return None
    return GeoPoint(lat, lng)


def main() -> int:
    db = get_firestore_client()
    bucket = get_storage_bucket()

    # Step 1: Delete all existing profiles
    print("Deleting existing profiles...")
    profile_docs = list(db.collection("profiles").stream())
    for doc in profile_docs:
        firestore_service.delete_profile(db, doc.id)
        print(f"  Deleted profile {doc.id}")
    deleted_storage = storage_service.delete_prefix(bucket, "profiles/")
    print(f"  Deleted {deleted_storage} Storage blobs under profiles/")

    # Step 2: Create profiles from tmp/photos
    photos = sorted(PHOTOS_DIR.glob("*.jpg"))
    if not photos:
        print(f"No photos found in {PHOTOS_DIR}")
        return 1

    print(f"\nCreating {len(photos)} profiles from {PHOTOS_DIR}...")
    created = 0
    for photo_path in photos:
        sighting_id = photo_path.stem.split("_")[0]
        sighting_doc = db.collection("sightings").document(sighting_id).get()
        if not sighting_doc.exists:
            print(f"  Skip {photo_path.name}: sighting {sighting_id} not found")
            continue

        sighting = sighting_doc.to_dict()
        embedding = sighting.get("embedding")
        if not embedding:
            print(f"  Skip {photo_path.name}: sighting {sighting_id} has no embedding")
            continue

        location = sighting.get("location")
        if location is None:
            lat, lng = None, None
        elif isinstance(location, dict):
            lat, lng = location.get("latitude"), location.get("longitude")
        else:
            lat = getattr(location, "latitude", None)
            lng = getattr(location, "longitude", None)

        vet_data = _random_vet_intake_data(hash(sighting_id) % (2**32))

        created_at = sighting.get("created_at")
        updated_at = sighting.get("updated_at")
        if isinstance(created_at, str):
            created_at = datetime.fromisoformat(created_at.replace("Z", "+00:00"))
        if isinstance(updated_at, str):
            updated_at = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        if not created_at:
            created_at = datetime.now(timezone.utc)
        if not updated_at:
            updated_at = created_at

        profile_id = uuid.uuid4().hex
        doc_data = {
            "name": vet_data["name"],
            "species": "dog",
            "sex": vet_data["sex"],
            "breed": "",
            "color_description": vet_data["primary_color"],
            "distinguishing_features": "",
            "estimated_age_months": None,
            "location_found": _geo_to_firestore(lat, lng),
            "notes": "",
            "photo_count": 0,
            "embedding": embedding,
            "model_version": sighting.get("model_version", "v1.0"),
            "sightings": [],
            "last_seen_location": None,
            "last_seen_at": None,
            "age_estimate": vet_data["age_estimate"],
            "primary_color": vet_data["primary_color"],
            "microchip_id": "",
            "collar_tag_id": "",
            "neuter_status": vet_data["neuter_status"],
            "surgery_date": "",
            "rabies": vet_data["rabies"],
            "dhpp": vet_data["dhpp"],
            "bite_risk": vet_data["bite_risk"],
            "diseases": vet_data["diseases"],
            "clinic_name": vet_data["clinic_name"],
            "intake_location": vet_data["intake_location"],
            "release_location": vet_data["release_location"],
            "created_at": created_at,
            "updated_at": updated_at,
        }

        db.collection("profiles").document(profile_id).set(doc_data)

        photo_data = photo_path.read_bytes()
        photo_id = uuid.uuid4().hex
        dest_path = f"profiles/{profile_id}/photos/{photo_id}.jpg"
        storage_service.upload_file(bucket, dest_path, photo_data, content_type="image/jpeg")
        firestore_service.add_photo_meta(db, profile_id, photo_id, dest_path, angle="face")

        created += 1
        print(f"  Created profile {profile_id} for {sighting_id} ({vet_data['name']})")

    print(f"\nRebuild complete: {created} profiles created")
    return 0


if __name__ == "__main__":
    sys.exit(main())
