from datetime import timedelta

from google.cloud.storage import Bucket

from backend.config import settings


def upload_file(bucket: Bucket, storage_path: str, file_data: bytes, content_type: str = "image/jpeg") -> str:
    blob = bucket.blob(storage_path)
    blob.upload_from_string(file_data, content_type=content_type)
    return storage_path


def generate_signed_url(bucket: Bucket, storage_path: str) -> str | None:
    blob = bucket.blob(storage_path)
    if not blob.exists():
        return None
    return blob.generate_signed_url(
        expiration=timedelta(minutes=settings.signed_url_expiration_minutes),
        method="GET",
    )


def delete_file(bucket: Bucket, storage_path: str) -> bool:
    blob = bucket.blob(storage_path)
    if not blob.exists():
        return False
    blob.delete()
    return True


def delete_prefix(bucket: Bucket, prefix: str) -> int:
    blobs = list(bucket.list_blobs(prefix=prefix))
    for blob in blobs:
        blob.delete()
    return len(blobs)
