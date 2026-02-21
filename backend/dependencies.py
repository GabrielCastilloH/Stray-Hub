import os

import firebase_admin
from firebase_admin import credentials, firestore, storage
from google.cloud.firestore import Client as FirestoreClient
from google.cloud.storage import Bucket

from backend.config import settings

_app: firebase_admin.App | None = None


def is_emulator() -> bool:
    """Check if running against Firebase emulators."""
    return bool(os.environ.get("FIRESTORE_EMULATOR_HOST"))


def _init_firebase() -> None:
    global _app
    if _app is not None:
        return

    if is_emulator():
        # When using emulators, no real credentials are needed.
        # firebase-admin auto-detects FIRESTORE_EMULATOR_HOST and
        # FIREBASE_STORAGE_EMULATOR_HOST env vars.
        _app = firebase_admin.initialize_app(
            None,
            {
                "projectId": "stray-hub-dev",
                "storageBucket": settings.storage_bucket or "stray-hub-dev.appspot.com",
            },
        )
    else:
        if settings.firebase_credentials_path:
            cred = credentials.Certificate(settings.firebase_credentials_path)
        else:
            cred = credentials.ApplicationDefault()
        _app = firebase_admin.initialize_app(
            cred,
            {"storageBucket": settings.storage_bucket} if settings.storage_bucket else None,
        )


def get_firestore_client() -> FirestoreClient:
    _init_firebase()
    return firestore.client()


def get_storage_bucket() -> Bucket:
    _init_firebase()
    return storage.bucket()
