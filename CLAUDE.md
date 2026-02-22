# CLAUDE.md
## Project Shrub (Stray Hub)
A computer-vision platform for coordinating stray animal catch-and-release programs.
Clinics create biometric profiles from multi-angle photos; field workers snap a photo
and an AI vector similarity search surfaces matches for human confirmation.

---

Stray Hub — an AI-powered biometric data hub for stray populations. Current stray management efforts—from catch-and-release programs to disease control—suffer from fragmented data and poor animal identification. By simply snapping a photo of a stray, field workers trigger a computer vision similarity search that instantly pulls up a comprehensive profile. This single interaction feeds multiple critical use cases: it immediately verifies an animal's CNVR (Catch, Neuter, Vaccinate, Return) status to prevent redundant recaptures, while simultaneously aggregating geotagged health metrics. Ultimately, this centralized platform empowers organizations to conserve veterinary resources, map disease hotspots in real-time, and shift from reactive treatments to proactive outbreak prevention.

## How Claude Should Work on This Project

Before writing any code, Claude must run an internal two-phase loop:

### Phase 1 — Plan Mode
Think architecturally before touching any file:
- What is the blast radius of this change? (Which layers does it touch: mobile, functions, ML, Firestore, Storage?)
- Does this change require updates to `firestore.rules` or `storage.rules`? If yes, flag it explicitly.
- Is this the right layer for this logic? (e.g., don't put ML logic in Cloud Functions; don't put business rules in the mobile app.)
- Are there edge cases in offline/low-connectivity mobile scenarios?
- What is the data flow? Sketch it mentally: Mobile → Function → Firestore/Storage → ML pipeline → back.
- Would a simpler design work? Prefer boring, debuggable solutions over clever ones.

### Phase 2 — Self-Review Before Responding
After drafting a solution, Claude should review its own output against these questions:
- Does this introduce a security hole? (Check: unauthenticated access, missing Firestore rules, exposed keys.)
- Does this break the ML pipeline's assumptions about image format, embedding shape, or vector index schema?
- Is the TypeScript callable using the correct `functions.https.onCall` pattern with proper auth context checks?
- Are new Python files snake_case? New TS files camelCase?
- Would this work on a real device with a slow connection or brief offline window?
- Did I avoid committing model weights or `.env` files?
- Is the response actually complete, or did I leave placeholder TODOs that block real use?

If the answer to any review question reveals a problem, Claude should revise before presenting the solution and note what it caught.

---
### Phase 3 — Update CLAUDE.md

After every non-trivial task, Claude must ask: **"Did I learn something about this codebase that future-me should know?"**

If yes, Claude updates `CLAUDE.md` before closing the task. This is not optional.

**Triggers that require a CLAUDE.md update:**
- A new architectural pattern was introduced or an existing one was changed
- A new gotcha, edge case, or pitfall was discovered (especially one that caused a bug or required backtracking)
- A new convention was established (naming, file location, data shape, API contract)
- A workflow step turned out to be more nuanced than documented
- A "Common Pitfall" was encountered in the wild — move it up, add detail, make it more specific
- A new tool, library, or service was added to the stack
- Firestore/Storage schema changed
- ML pipeline assumptions changed (embedding shape, preprocessing, model version behavior)

**What NOT to add:**
- Implementation details that belong in code comments
- One-off decisions that won't recur
- Obvious things already implied by the stack

**How to update:**
- Edit the relevant section in place — don't append a changelog at the bottom
- Be specific: bad → "be careful with embeddings"; good → "CLIP embeddings are 512-dim float32; pgvector index must be created with `vector(512)` or queries will silently return wrong results"
- If a Common Pitfall is proven in practice, mark it with `⚠️ Confirmed in production` so it gets taken seriously
- Keep CLAUDE.md as a living document that reflects the actual codebase, not the intended one

**The test:** If a new Claude instance read only CLAUDE.md and then tried to work on this project, would it avoid the mistake that was just made or discovered? If not, the update is incomplete.

## Project Structure
```
backend/         # FastAPI REST API (Python, port 8001) — profiles, search/match, vet intake, confirm-sighting
firebase/        # Cloud Functions (TypeScript), Firestore, Cloud Storage config
mobile/          # Expo (React Native) mobile app
ml/              # Python ML pipeline: image embeddings, vector index, similarity search (port 8000)
scripts/         # One-off Python utility scripts
```

**Docs:** `ml/ML.md` (ML pipeline), `backend/Backend.md` (Backend API)

**DogFaceNet training:** The `DogFaceNet-master/` folder is gitignored. Clone the [DogFaceNet repo](https://github.com/GuillaumeMougeot/DogFaceNet) separately if you need to train new weights. Production inference uses `ml/services/dogfacenet/` only.

---

## Stack

| Layer | Technology |
|---|---|
| Mobile | Expo / React Native |
| Backend API | FastAPI (Python 3.11+, port 8001) — profiles, search, vet intake |
| Backend Functions | Firebase Cloud Functions (TypeScript, Node 18) — triggers, async jobs |
| Database | Cloud Firestore |
| Storage | Firebase Cloud Storage |
| ML | Python — vector embeddings + similarity search (port 8000) |
| Image Processing | Pillow (Python) — resize to 224x224 for ML pipeline |

---

## Commands
```bash
# Backend API
cd backend && pip install -r requirements.txt
uvicorn backend.main:app --port 8001 --reload   # run from project root

# Backend + Emulators (local dev, no cloud credentials needed)
./scripts/start_dev.sh

# Functions
cd firebase/functions && npm run build      # compile
cd firebase/functions && npm run serve      # local emulator

# Mobile
cd mobile && npm start

# ML
cd ml && pip install -r requirements.txt

# Run all backend tests
python -m pytest backend/tests/ -v

# Backup Firestore + Storage (before major schema changes)
python scripts/backup_firestore.py
python scripts/backup_storage.py
# Output: backend/_backup/firestore/*.json, backend/_backup/storage/

# Rebuild profiles from local photos (delete existing, recreate from tmp/photos)
python scripts/rebuild_profiles_from_photos.py  # requires tmp/photos with {sighting_id}_*.jpg; fetches embedding from Firestore
```

**Backup:** `backend/_backup/` is gitignored. Use `scripts/backup_firestore.py` and `scripts/backup_storage.py` before destructive schema changes. Requires valid Firebase credentials in `.env`.

**Scripts:** `backup_firestore.py`, `backup_storage.py` — backup before schema changes. `rebuild_profiles_from_photos.py` — wipe profiles and recreate from `tmp/photos` (filenames: `{sighting_id}_*.jpg`). `start_dev.sh` — start backend + emulators.

---

## Firebase Setup

**Firebase project:** `stray-hub` (Cloud Firestore + Cloud Storage enabled)

**Authentication:** Uses a service account key JSON file. The key lives in the project root but is gitignored via the pattern `*-firebase-adminsdk-*.json`.

**Configuration:** All backend config via `.env` file at project root (loaded by pydantic-settings):
```
STRAY_FIREBASE_CREDENTIALS_PATH=/absolute/path/to/stray-hub-firebase-adminsdk-*.json
STRAY_STORAGE_BUCKET=stray-hub.firebasestorage.app
```

**Emulator support:** When `FIRESTORE_EMULATOR_HOST` env var is set, the backend skips credential loading and connects to local emulators instead. The `scripts/start_dev.sh` script handles this automatically.

**Emulator config** (`firebase.json` at project root):
- Firestore: `127.0.0.1:8080`
- Storage: `127.0.0.1:9199`
- Emulator UI: `127.0.0.1:4000`

---

## Architecture Principles

**Layering rules — where logic lives:**
- Biometric embedding generation → `ml/` only. Never in Functions or mobile.
- Vector similarity search → Backend calls ML `/embed` for each photo; cosine similarity computed in backend against profile embeddings.
- Identity match confirmation → human-in-the-loop via mobile UI. Never auto-confirm in code. Confirmation appends to `profile.sightings`.
- Auth and authorization → Cloud Functions with Firebase Auth context. Mobile never trusts itself.
- Vet intake photos → Backend API receives multipart, uploads to `profiles/{id}/photos/`, embeds face photo for matching.
- Search photos → Processed in-memory only (resize + embed); never stored. Ephemeral operation.

**Data flow for field worker search (ephemeral — no storage of field worker photos):**
```
Client (mobile)
  → POST /api/v1/search/match (multipart: files[] + lat/lng)
  → Backend resizes each photo to 224×224 in memory (no Storage write)
  → POST each resized image to ML /embed
  → Average embeddings (element-wise mean, L2-normalize)
  → Fetch all profiles with non-null embeddings from Firestore
  → Compute cosine similarity vs each profile embedding
  → Filter ≥ threshold, sort descending, take top 5
  → Return SearchResponse with ProfileMatchCandidate list (profile_id, name, similarity, photo_signed_url)
  → Mobile navigates to /match-results with searchData + lat/lng as route params
```

**Data flow for match confirmation:**
```
User taps match card → GET /api/v1/profiles/{id} (fetch full profile, skeleton loading)
User taps "Confirm: This is the dog!" → POST /api/v1/profiles/{id}/confirm-sighting (JSON: {latitude, longitude})
  → Backend appends {timestamp, location} to profile.sightings array
  → Updates profile.last_seen_location and last_seen_at
```

**Data flow for vet intake (creates permanent profile):**
```
Vet (mobile)
  → POST /api/v1/profiles/intake (multipart: 5 angle-tagged photos + all form fields)
  → Backend creates profile in Firestore with identity/health/CNVR fields
  → Uploads each photo to profiles/{id}/photos/{photo_id}.jpg with angle metadata
  → Finds face photo, resizes to 224×224, POST to ML /embed
  → Stores embedding + model_version on profile doc
  → Returns ProfileResponse
```

**Mobile wiring:** Camera calls `searchMatch()` → navigates to match-results with `searchData` (SearchResponse). Match-results fetches full profile on tap via `getProfile()`, shows "Confirm" button, calls `confirmSighting()` on confirm. Vet intake calls `submitVetIntake()` with FormData.

**Offline-first considerations:**
- Mobile should queue photo captures locally if offline and sync when connectivity resumes.
- Never assume immediate Function response in the mobile UX.

---

## Firestore Schema

**Profiles are the only persistent entity.** Sightings and matches collections have been removed. A "sighting" is now a lightweight `{timestamp, location}` entry in a profile's `sightings` array.

```
profiles/{profile_id}
    name, species, sex, breed, color_description,
    distinguishing_features, estimated_age_months,
    location_found (GeoPoint), notes,
    photo_count (int),
    embedding (array of floats, nullable)     ← from face photo via vet intake
    model_version (string, nullable)
    sightings (array of {timestamp, location}) ← appended when field worker confirms match
    last_seen_location (GeoPoint, nullable)
    last_seen_at (datetime, nullable)
    age_estimate, primary_color, microchip_id, collar_tag_id,
    neuter_status, surgery_date, rabies (map), dhpp (map),
    bite_risk, diseases (array of {name, status}), clinic_name, intake_location, release_location,
    created_at, updated_at

    photos/{photo_id}          # subcollection
        storage_path, angle, uploaded_at   ← angle: face, left_side, right_side, front, back
```

**Deleted collections:** `sightings/`, `matches/` — no longer used. Backup scripts export them to `backend/_backup/firestore/` before any migration.

**Disease tag enum values:** `rabies`, `mange`, `distemper`, `parvovirus`, `other` (defined in `backend/models/common.py:DiseaseTag`)

## Cloud Storage Paths
```
profiles/{profile_id}/photos/{photo_id}.jpg   ← vet intake photos (angle-tagged)
```

**Field worker photos are NOT stored** — they are processed in-memory for embedding and discarded.

---

## Backend API Conventions

- **Port assignment:** Backend API = 8001, ML embed service = 8000. These must not collide.
- **API prefix:** All endpoints under `/api/v1/`. Swagger docs at `/docs`.
- **Pagination:** Cursor-based using Firestore document IDs (`start_after`). Never use offset pagination with Firestore.
- **Photos:** Stored as a Firestore subcollection (`profiles/{id}/photos/{photo_id}`), max 5 per profile. Enforced server-side.
- **Signed URLs:** In production, Cloud Storage generates signed URLs (default 60 min expiration). In emulator mode, direct emulator URLs are returned instead (emulator doesn't support signed URLs).
- **Config:** All backend config via `.env` file at project root, loaded by pydantic-settings. All vars prefixed `STRAY_` (e.g., `STRAY_STORAGE_BUCKET`). See `backend/config.py`. Key vars: `STRAY_IMAGE_RESIZE_SIZE` (224), `STRAY_SIMILARITY_THRESHOLD` (0.7), `STRAY_MAX_MATCH_RESULTS` (5).
- **Profile IDs:** Vet intake generates a UUID for the profile doc; photos are stored under `profiles/{id}/photos/`. Do not use Firestore auto-IDs for profiles — use `.document(id).set()`.
- **Image resizing:** Vet intake face photo is resized to 224x224 for ML embedding. Search match photos are resized in-memory only (no storage).
- **No auth yet:** Endpoint structure supports middleware addition later. Do not add auth stubs or decorators prematurely.
- **Search endpoint:** `POST /api/v1/search/match` accepts face photos + GPS. Photos are embedded in-memory (no storage). Matches against profile embeddings. Returns up to `STRAY_MAX_MATCH_RESULTS` (default 5) `ProfileMatchCandidate` results.
- **Vet intake endpoint:** `POST /api/v1/profiles/intake` accepts multipart form with up to 5 angle-tagged photos + identity/health/CNVR fields. Creates profile, uploads photos, embeds face photo for matching.
- **Confirm-sighting endpoint:** `POST /api/v1/profiles/{id}/confirm-sighting` accepts JSON `{latitude, longitude}`. Appends `{timestamp, location}` to profile.sightings and updates last_seen fields.
- **Similarity threshold:** Match candidates must have cosine similarity ≥ `STRAY_SIMILARITY_THRESHOLD` (default 0.7). Both query and candidate embeddings are L2-normalized before dot product.
- **numpy dependency:** Used in backend for embedding averaging and cosine similarity computation.

---

## Conventions

- **Language:** TypeScript for Firebase functions; Python for ML, backend API, and scripts.
- **Naming:** `snake_case` for Python files; `camelCase` for TypeScript files.
- **Firebase endpoints:** Always `functions.https.onCall` callables with explicit `context.auth` checks.
- **Security:** Every feature touching data must update `firestore.rules` and `storage.rules`. Never skip this.
- **Secrets:** Never commit `.env` files or model weights (`.pt`, `.pth`, `.onnx`, `.h5`, `.pkl`). Service account keys are gitignored via `*-firebase-adminsdk-*.json`.
- **Linting:** ESLint + Prettier for TypeScript; Ruff for Python.
- **Tests:** Jest for TypeScript; pytest for Python. New features should include at least a smoke test. Sighting tests must use valid images (Pillow-compatible) — fake byte strings like `b"\xff\xd8..."` will crash the resize step.
- **ML schema changes:** Any change to embedding dimensions, preprocessing, or model → update the Schema section in `ml/ML.md`.
- **Mobile API client:** `mobile/src/api/client.ts` uses `fetch` + `FormData` (no axios/external lib). `searchMatch()` for field search; `getProfile()` for full profile; `confirmSighting()` for match confirmation; `submitVetIntake()` for vet intake. Base URL defaults to `http://localhost:8001` in dev.
- **Mobile route params:** Search response (`SearchResponse`) is passed to match-results as `searchData` (JSON-serialized) plus `latitude`/`longitude`. Parsed with `useLocalSearchParams`.
- **expo-location:** Used to get GPS coordinates on upload. Permission is requested lazily (only when user taps Upload, not on screen mount).

---

## Common Pitfalls to Avoid

- Don't put similarity search calls inside synchronous HTTP callables — ML is async by nature.
- Don't skip `storage.rules` updates when adding new Storage paths.
- Don't hardcode animal/clinic IDs in tests — use fixtures.
- Don't assume the mobile camera always returns a consistent image format; normalize before embedding.
- Don't expose raw Firestore document IDs as the sole animal identifier in the mobile UI — these are internal keys.
- ⚠️ **Confirmed:** Don't use Firestore `.add()` for profiles — it generates a different ID than the one used in Storage paths, causing ID mismatches. Use `.document(id).set()` instead.
- ⚠️ **Confirmed:** Don't use fake JPEG bytes in tests (e.g., `io.BytesIO(b"\xff\xd8\xff\xe0fake")`) — Pillow cannot open them and the resize step will crash. Use `PIL.Image.new()` to generate valid test images.
- ⚠️ **Confirmed:** The `.env` file must use `KEY=VALUE` format only — no `export` keyword, no shell commands, no line-wrapped values. pydantic-settings parses it directly, not through a shell.
- ⚠️ **Confirmed:** `STRAY_FIREBASE_CREDENTIALS_PATH` must be an absolute path. Relative paths (e.g., `./file.json`) may fail depending on the working directory when uvicorn starts.
- Don't confuse Firebase **Realtime Database** with **Cloud Firestore** — they are completely separate products. This project uses Cloud Firestore only. The service account key covers both, but the API must be enabled separately in the Firebase Console.
- **ProfileMatchCandidate:** Search returns `profile_id` (not sighting_id). Match confirmation appends to `profile.sightings`; there is no separate matches collection.
- ⚠️ **Confirmed:** `profile.diseases` must be `list[dict]` with `{name, status}` per ProfileResponse. Using `["rabies", "mange"]` (strings) causes Pydantic validation errors on GET /profiles.
