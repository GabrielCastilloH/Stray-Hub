#!/usr/bin/env python3
"""
Download ALL files from Firebase Cloud Storage to backend/_backup/storage/.
Run from project root. Uses .env for credentials.
"""
import os
import sys
from pathlib import Path

# Add project root to path; pydantic-settings loads .env from cwd
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.dependencies import get_storage_bucket


def main():
    out_dir = Path(__file__).resolve().parent.parent / "backend" / "_backup" / "storage"
    out_dir.mkdir(parents=True, exist_ok=True)

    try:
        bucket = get_storage_bucket()
        blobs = list(bucket.list_blobs())
    except Exception as e:
        print(f"Storage connection failed: {e}")
        print("Storage backup skipped. Run again with valid credentials to download files.")
        return 0

    file_count = 0
    total_bytes = 0

    for blob in blobs:
        local_path = out_dir / blob.name
        local_path.parent.mkdir(parents=True, exist_ok=True)
        blob.download_to_filename(str(local_path))
        size = local_path.stat().st_size
        file_count += 1
        total_bytes += size
        if file_count % 10 == 0 or file_count <= 5:
            print(f"  Downloaded {file_count}: {blob.name} ({size} bytes)")

    print(f"\nStorage backup complete: {file_count} files, {total_bytes:,} bytes -> {out_dir}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
