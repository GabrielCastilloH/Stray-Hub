#!/usr/bin/env python3
"""
Profile management script.

Usage:
  # Wipe + rebuild all profiles from tmp/photos/
  python scripts/rebuild_profiles_from_photos.py

  # Add a single profile from one image
  python scripts/rebuild_profiles_from_photos.py --single tmp/newdog.png

  # Add a single profile with a custom name
  python scripts/rebuild_profiles_from_photos.py --single tmp/newdog.png --name "Pepper"

Run from project root. Requires .env with STRAY_FIREBASE_CREDENTIALS_PATH, STRAY_STORAGE_BUCKET.
ML service must be running at localhost:8000 (or ML_SERVICE_URL).
"""
import argparse
import os
import sys
import time
import uuid
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

import httpx

from backend.dependencies import get_firestore_client, get_storage_bucket

PHOTOS_DIR = Path(__file__).resolve().parent.parent / "tmp" / "photos"
ML_URL = os.environ.get("ML_SERVICE_URL", "http://localhost:8000")

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


def _random_vet_data(seed: int) -> dict:
    import random
    rng = random.Random(seed)
    return {
        "name": rng.choice(DOG_NAMES),
        "sex": rng.choice(SEX_VALUES),
        "age_estimate": rng.choice(AGE_ESTIMATES),
        "primary_color": rng.choice(PRIMARY_COLORS),
        "neuter_status": rng.choice(NEUTER_STATUSES),
        "bite_risk": rng.choice(BITE_RISKS),
        "clinic_name": rng.choice(CLINIC_NAMES),
        "diseases": rng.choice(DISEASES_OPTIONS),
        "rabies": {"status": "vaccinated", "date_admin": "2024-01-15"} if rng.random() > 0.3 else {},
        "dhpp": {"status": "vaccinated", "date": "2024-01-15"} if rng.random() > 0.4 else {},
        "intake_location": f"Intake Site {rng.randint(1, 5)}",
        "release_location": f"Release Zone {rng.randint(1, 3)}",
    }


def _fetch_embedding(photo_bytes: bytes) -> list[float] | None:
    """Call ML /embed. Returns embedding or None on failure."""
    try:
        with httpx.Client(timeout=30.0) as client:
            resp = client.post(
                f"{ML_URL}/embed",
                files={"file": ("face_224.jpg", photo_bytes, "image/jpeg")},
            )
        if resp.status_code == 200:
            return resp.json()["embedding"]
    except Exception as e:
        print(f"    ML embed failed: {e}")
    return None


def _process_one(
    photo_path: Path,
    db,
    bucket,
    profile_number: int,
) -> tuple[str, bool]:
    """Create one profile from one photo. Returns (profile_id, embedding_ok)."""
    sighting_id = photo_path.stem.split("_")[0]
    vet_data = _random_vet_data(hash(sighting_id) % (2**32))
    now = datetime.now(timezone.utc)

    profile_id = uuid.uuid4().hex
    photo_id = uuid.uuid4().hex
    storage_path = f"profiles/{profile_id}/photos/{photo_id}.jpg"

    # Upload to Storage
    photo_bytes = photo_path.read_bytes()
    blob = bucket.blob(storage_path)
    blob.upload_from_string(photo_bytes, content_type="image/jpeg")

    # Get embedding from ML (photos are already 224x224)
    embedding = _fetch_embedding(photo_bytes)
    has_embedding = embedding is not None
    model_version = "v1.0" if has_embedding else ""

    # Write profile doc
    doc_data = {
        "name": vet_data["name"],
        "species": "dog",
        "sex": vet_data["sex"],
        "breed": "",
        "color_description": "",
        "distinguishing_features": "",
        "estimated_age_months": None,
        "location_found": None,
        "notes": "",
        "photo_count": 1,
        "face_photo_id": photo_id,
        "has_embedding": has_embedding,
        "embedding": embedding,
        "model_version": model_version,
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
        "profile_number": profile_number,
        "created_at": now,
        "updated_at": now,
    }
    db.collection("profiles").document(profile_id).set(doc_data)

    # Write photo subcollection
    db.collection("profiles").document(profile_id).collection("photos").document(
        photo_id
    ).set({
        "storage_path": storage_path,
        "angle": "face",
        "uploaded_at": now,
    })

    return profile_id, has_embedding


def _next_profile_number(db) -> int:
    """Atomically increment and return the next profile_number."""
    from google.cloud.firestore import Increment

    counter_ref = db.collection("counters").document("profiles")
    counter_ref.set({"count": Increment(1)}, merge=True)
    return counter_ref.get().to_dict()["count"]


def add_single_profile(
    image_path: str | Path,
    name: str | None = None,
    db=None,
    bucket=None,
) -> str:
    """Add one profile from a single image file. Returns the new profile_id."""
    image_path = Path(image_path)
    if not image_path.exists():
        raise FileNotFoundError(f"Image not found: {image_path}")

    if db is None or bucket is None:
        db = get_firestore_client()
        bucket = get_storage_bucket()

    profile_number = _next_profile_number(db)
    seed = int(uuid.uuid4().int % (2**32))
    vet_data = _random_vet_data(seed)
    if name:
        vet_data["name"] = name

    now = datetime.now(timezone.utc)
    profile_id = uuid.uuid4().hex
    photo_id = uuid.uuid4().hex
    storage_path = f"profiles/{profile_id}/photos/{photo_id}.jpg"

    photo_bytes = image_path.read_bytes()
    blob = bucket.blob(storage_path)
    blob.upload_from_string(photo_bytes, content_type="image/jpeg")
    print(f"  Uploaded to {storage_path}")

    embedding = _fetch_embedding(photo_bytes)
    has_embedding = embedding is not None
    model_version = "v1.0" if has_embedding else ""

    doc_data = {
        "name": vet_data["name"],
        "species": "dog",
        "sex": vet_data["sex"],
        "breed": "",
        "color_description": "",
        "distinguishing_features": "",
        "estimated_age_months": None,
        "location_found": None,
        "notes": "",
        "photo_count": 1,
        "face_photo_id": photo_id,
        "has_embedding": has_embedding,
        "embedding": embedding,
        "model_version": model_version,
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
        "profile_number": profile_number,
        "created_at": now,
        "updated_at": now,
    }
    db.collection("profiles").document(profile_id).set(doc_data)

    db.collection("profiles").document(profile_id).collection("photos").document(
        photo_id
    ).set({
        "storage_path": storage_path,
        "angle": "face",
        "uploaded_at": now,
    })

    status = "with embedding" if has_embedding else "NO embedding"
    print(f"  Created profile {profile_id} (#{profile_number}, {status})")
    print(f"  Name: {vet_data['name']}")
    return profile_id


def rebuild_all() -> int:
    """Wipe all profiles and rebuild from tmp/photos/."""
    start = time.time()
    db = get_firestore_client()
    bucket = get_storage_bucket()

    print("Deleting existing profiles...")
    profile_docs = list(db.collection("profiles").stream())
    for doc in profile_docs:
        for sub in doc.reference.collection("photos").stream():
            sub.reference.delete()
        doc.reference.delete()
        print(f"  Deleted profile {doc.id}")
    blobs = list(bucket.list_blobs(prefix="profiles/"))
    for blob in blobs:
        blob.delete()
    print(f"  Deleted {len(blobs)} Storage blobs")

    counter_ref = db.collection("counters").document("profiles")
    counter_ref.delete()
    print("  Deleted counters/profiles")

    photos = sorted(PHOTOS_DIR.glob("*.jpg"))
    if not photos:
        print(f"No photos in {PHOTOS_DIR}")
        return 1

    print(f"\nCreating {len(photos)} profiles from {PHOTOS_DIR}...")
    created = 0
    embeddings_ok = 0

    with ThreadPoolExecutor(max_workers=4) as ex:
        futures = {
            ex.submit(_process_one, p, db, bucket, i + 1): p
            for i, p in enumerate(photos)
        }
        for future in as_completed(futures):
            photo_path = futures[future]
            try:
                profile_id, ok = future.result()
                created += 1
                if ok:
                    embeddings_ok += 1
                print(f"  Created {profile_id} ({photo_path.name})")
            except Exception as e:
                print(f"  Failed {photo_path.name}: {e}")

    db.collection("counters").document("profiles").set({"count": len(photos)})
    print(f"  Updated counters/profiles to {len(photos)}")

    elapsed = time.time() - start
    print(f"\nDone: {created} profiles, {embeddings_ok} with embeddings, {elapsed:.1f}s")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(description="Manage stray profiles")
    parser.add_argument(
        "--single", type=str, metavar="IMAGE",
        help="Add a single profile from one image instead of rebuilding all",
    )
    parser.add_argument(
        "--name", type=str, default=None,
        help="Name for the new profile (used with --single)",
    )
    args = parser.parse_args()

    if args.single:
        print(f"Adding single profile from: {args.single}")
        try:
            profile_id = add_single_profile(args.single, name=args.name)
            print(f"\nSuccess! Profile ID: {profile_id}")
            return 0
        except Exception as e:
            print(f"\nFailed: {e}")
            return 1
    else:
        return rebuild_all()


if __name__ == "__main__":
    sys.exit(main())
