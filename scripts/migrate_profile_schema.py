#!/usr/bin/env python3
"""
Migrate existing profiles to the current schema.

Backfills:
  - face_photo_id: UUID of the face photo (replaces face_photo_path)
  - has_embedding: True if profile has a non-empty embedding array

Also migrates legacy face_photo_path (full storage path) → face_photo_id (UUID only).

Run from project root. Uses .env for credentials.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.dependencies import get_firestore_client
from backend.services.firestore_service import _now


def _get_face_photo_id_from_subcollection(db, profile_id: str) -> str | None:
    """Scan photos subcollection for face photo or first photo, return doc ID."""
    photos = (
        db.collection("profiles")
        .document(profile_id)
        .collection("photos")
        .order_by("uploaded_at")
        .stream()
    )
    face_id = None
    first_id = None
    for p in photos:
        data = p.to_dict()
        if data.get("angle") == "face":
            face_id = p.id
            break
        if first_id is None:
            first_id = p.id
    return face_id or first_id


def main():
    try:
        db = get_firestore_client()
    except Exception as e:
        print(f"Firestore connection failed: {e}")
        return 1

    profiles = db.collection("profiles").stream()
    updated = 0
    skipped = 0

    for doc in profiles:
        data = doc.to_dict()
        profile_id = doc.id
        updates = {}

        # Migrate legacy face_photo_path → face_photo_id
        if "face_photo_path" in data and "face_photo_id" not in data:
            legacy_path = data["face_photo_path"]
            if legacy_path:
                # Extract UUID from "profiles/{id}/photos/{uuid}.jpg"
                photo_id = Path(legacy_path).stem
                updates["face_photo_id"] = photo_id
            else:
                updates["face_photo_id"] = None
            updates["face_photo_path"] = None  # clear the old field

        if "face_photo_id" not in data and "face_photo_path" not in data:
            photo_id = _get_face_photo_id_from_subcollection(db, profile_id)
            updates["face_photo_id"] = photo_id

        if "has_embedding" not in data:
            emb = data.get("embedding")
            updates["has_embedding"] = bool(emb and len(emb) > 0)

        if updates:
            updates["updated_at"] = _now()
            db.collection("profiles").document(profile_id).update(updates)
            updated += 1
            print(f"  {profile_id}: {updates}")
        else:
            skipped += 1

    print(f"\nMigration complete: {updated} updated, {skipped} already up to date")
    return 0


if __name__ == "__main__":
    sys.exit(main())
