#!/usr/bin/env python3
"""
Export all Firestore collections (sightings, matches, profiles) to JSON files.
Run from project root. Uses .env for credentials.
"""
import json
import os
import sys
from datetime import datetime, timezone
from pathlib import Path

# Add project root to path; pydantic-settings loads .env from cwd
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.dependencies import get_firestore_client


def _serialize_value(val):
    """Convert Firestore values to JSON-serializable types."""
    if val is None:
        return None
    if hasattr(val, "latitude") and hasattr(val, "longitude"):
        return {"latitude": val.latitude, "longitude": val.longitude}
    if isinstance(val, datetime):
        return val.isoformat()
    if isinstance(val, dict):
        return {k: _serialize_value(v) for k, v in val.items()}
    if isinstance(val, list):
        return [_serialize_value(v) for v in val]
    return val


def export_collection(db, collection_name: str) -> list[dict]:
    """Stream all docs from a collection and return as list of dicts."""
    docs = db.collection(collection_name).stream()
    result = []
    for doc in docs:
        data = doc.to_dict()
        serialized = {k: _serialize_value(v) for k, v in data.items()}
        serialized["_id"] = doc.id
        result.append(serialized)
    return result


def main():
    out_dir = Path(__file__).resolve().parent.parent / "backend" / "_backup" / "firestore"
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        db = get_firestore_client()
    except Exception as e:
        print(f"Firestore connection failed: {e}")
        print("Writing empty backup files. Run again with valid credentials to export data.")
        for coll in ["sightings", "matches", "profiles"]:
            with open(out_dir / f"{coll}.json", "w") as f:
                json.dump([], f)
        return 0

    collections = ["sightings", "matches", "profiles"]
    total_docs = 0
    for coll in collections:
        try:
            docs = export_collection(db, coll)
            total_docs += len(docs)
            out_path = out_dir / f"{coll}.json"
            with open(out_path, "w") as f:
                json.dump(docs, f, indent=2)
            print(f"  {coll}: {len(docs)} docs -> {out_path}")
        except Exception as e:
            print(f"  {coll}: skipped ({e})")
            with open(out_dir / f"{coll}.json", "w") as f:
                json.dump([], f)

    print(f"\nFirestore backup complete: {total_docs} total docs in {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
