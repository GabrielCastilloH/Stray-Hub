#!/usr/bin/env python3
"""
Migrate existing profiles to the new schema (face_photo_path, has_embedding).

Backfills:
  - face_photo_path: storage path of face photo (angle=face) or first photo
  - has_embedding: True if profile has a non-empty embedding array

Run from project root. Uses .env for credentials.
"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.dependencies import get_firestore_client
from backend.services.firestore_service import _now


def _get_face_photo_path_from_subcollection(db, profile_id: str) -> str | None:
    """Scan photos subcollection for face photo or first photo."""
    photos = (
        db.collection("profiles")
        .document(profile_id)
        .collection("photos")
        .order_by("uploaded_at")
        .stream()
    )
    face_path = None
    first_path = None
    for p in photos:
        data = p.to_dict()
        path = data.get("storage_path")
        if not path:
            continue
        if data.get("angle") == "face":
            face_path = path
            break
        if first_path is None:
            first_path = path
    return face_path or first_path


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

        if "face_photo_path" not in data:
            path = _get_face_photo_path_from_subcollection(db, profile_id)
            updates["face_photo_path"] = path

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
