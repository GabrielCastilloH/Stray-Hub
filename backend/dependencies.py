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

    if settings.firebase_credentials_path:
        cred = credentials.Certificate(settings.firebase_credentials_path)
    else:
        cred = credentials.ApplicationDefault()

    options = {}
    if is_emulator():
        options["projectId"] = "stray-hub-dev"
    if settings.storage_bucket:
        options["storageBucket"] = settings.storage_bucket
    elif is_emulator():
        options["storageBucket"] = "stray-hub-dev.appspot.com"

    _app = firebase_admin.initialize_app(cred, options or None)


def get_firestore_client() -> FirestoreClient:
    _init_firebase()
    return firestore.client()


def get_storage_bucket() -> Bucket:
    _init_firebase()
    return storage.bucket()
