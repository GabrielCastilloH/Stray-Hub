"""Test fixtures with mocked Firebase services."""
import uuid
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient


# --- Fake Firestore in-memory store ---

class FakeGeoPoint:
    def __init__(self, latitude, longitude):
        self.latitude = latitude
        self.longitude = longitude


class FakeDocRef:
    def __init__(self, store, collection_path, doc_id):
        self._store = store
        self._collection_path = collection_path
        self.id = doc_id

    def _key(self):
        return (self._collection_path, self.id)

    def get(self):
        data = self._store.get(self._key())
        return FakeDocSnapshot(self.id, data, self._collection_path, self._store)

    def set(self, data):
        self._store[self._key()] = dict(data)

    def update(self, data):
        existing = self._store.get(self._key(), {})
        for k, v in data.items():
            if isinstance(v, FakeIncrement):
                existing[k] = existing.get(k, 0) + v.value
            else:
                existing[k] = v
        self._store[self._key()] = existing

    def delete(self):
        self._store.pop(self._key(), None)

    def collection(self, name):
        return FakeCollectionRef(self._store, f"{self._collection_path}/{self.id}/{name}")


class FakeIncrement:
    def __init__(self, value):
        self.value = value


class FakeDocSnapshot:
    def __init__(self, doc_id, data, collection_path, store):
        self.id = doc_id
        self._data = data
        self._collection_path = collection_path
        self._store = store
        self.exists = data is not None
        self.reference = FakeDocRef(store, collection_path, doc_id)

    def to_dict(self):
        return dict(self._data) if self._data else None


class FakeQuery:
    def __init__(self, store, collection_path, docs=None):
        self._store = store
        self._collection_path = collection_path
        self._docs = docs

    def _get_docs(self):
        if self._docs is not None:
            return self._docs
        results = []
        for (coll, doc_id), data in self._store.items():
            if coll == self._collection_path:
                results.append(FakeDocSnapshot(doc_id, data, self._collection_path, self._store))
        return results

    def order_by(self, field, direction=None):
        docs = self._get_docs()
        reverse = direction == "DESCENDING" if direction else False
        docs.sort(key=lambda d: d.to_dict().get(field, datetime.min.replace(tzinfo=timezone.utc)), reverse=reverse)
        return FakeQuery(self._store, self._collection_path, docs)

    def where(self, filter=None, **kwargs):
        docs = self._get_docs()
        if filter:
            field = filter.field_path
            op = filter.op_string
            value = filter.value
        else:
            field = kwargs.get("field")
            op = kwargs.get("op")
            value = kwargs.get("value")
        filtered = [d for d in docs if d.to_dict().get(field) == value]
        return FakeQuery(self._store, self._collection_path, filtered)

    def start_after(self, doc_snapshot):
        docs = self._get_docs()
        idx = next((i for i, d in enumerate(docs) if d.id == doc_snapshot.id), -1)
        if idx >= 0:
            docs = docs[idx + 1:]
        return FakeQuery(self._store, self._collection_path, docs)

    def limit(self, n):
        docs = self._get_docs()[:n]
        return FakeQuery(self._store, self._collection_path, docs)

    def stream(self):
        return iter(self._get_docs())


class FakeCollectionRef(FakeQuery):
    def __init__(self, store, collection_path):
        super().__init__(store, collection_path)

    def document(self, doc_id):
        return FakeDocRef(self._store, self._collection_path, doc_id)

    def add(self, data):
        doc_id = uuid.uuid4().hex
        doc_ref = FakeDocRef(self._store, self._collection_path, doc_id)
        doc_ref.set(data)
        return None, doc_ref


class FakeFirestoreClient:
    def __init__(self):
        self._store = {}

    def collection(self, name):
        return FakeCollectionRef(self._store, name)


# --- Fake Storage ---

class FakeBlob:
    def __init__(self, name, bucket):
        self.name = name
        self._bucket = bucket

    def upload_from_string(self, data, content_type=None):
        self._bucket._blobs[self.name] = data

    def exists(self):
        return self.name in self._bucket._blobs

    def delete(self):
        self._bucket._blobs.pop(self.name, None)

    def generate_signed_url(self, expiration=None, method=None):
        return f"https://storage.example.com/signed/{self.name}"


class FakeBucket:
    def __init__(self):
        self._blobs = {}

    def blob(self, name):
        return FakeBlob(name, self)

    def exists(self):
        return True

    def list_blobs(self, prefix=None):
        return [FakeBlob(k, self) for k in self._blobs if k.startswith(prefix or "")]


# --- Fixtures ---

@pytest.fixture()
def fake_db():
    return FakeFirestoreClient()


@pytest.fixture()
def fake_bucket():
    return FakeBucket()


@pytest.fixture()
def client(fake_db, fake_bucket):
    with patch("backend.dependencies._init_firebase"):
        with patch("backend.dependencies.get_firestore_client", return_value=fake_db):
            with patch("backend.dependencies.get_storage_bucket", return_value=fake_bucket):
                # Patch the GeoPoint import used in firestore_service
                with patch(
                    "google.cloud.firestore_v1._helpers.GeoPoint",
                    FakeGeoPoint,
                ):
                    # Patch Increment
                    with patch(
                        "google.cloud.firestore_v1.transforms.Increment",
                        FakeIncrement,
                    ):
                        from backend.main import app
                        yield TestClient(app)
