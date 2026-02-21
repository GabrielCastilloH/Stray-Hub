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
backend/         # FastAPI REST API (Python, port 8001) — CRUD, photo management, match feedback
firebase/        # Cloud Functions (TypeScript), Firestore, Cloud Storage config
mobile/          # Expo (React Native) mobile app
ml/              # Python ML pipeline: image embeddings, vector index, similarity search (port 8000)
scripts/         # One-off Python utility scripts
```

**Docs:** `ml/ML.md` (ML pipeline), `backend/Backend.md` (Backend API)

---

## Stack

| Layer | Technology |
|---|---|
| Mobile | Expo / React Native |
| Backend API | FastAPI (Python 3.11+, port 8001) — CRUD, photo mgmt, match feedback |
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
```

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
- Vector similarity search → `ml/` pipeline, triggered async. Functions should not block on ML.
- Identity match confirmation → human-in-the-loop via mobile UI. Never auto-confirm in code.
- Auth and authorization → Cloud Functions with Firebase Auth context. Mobile never trusts itself.
- Image upload → Backend API receives multipart upload, resizes to 224x224, stores both original + resized in Cloud Storage.
- Image resizing → Always done server-side in the backend API with Pillow. Resized images are 224x224 JPEG (ML-model-compatible). Both original and resized are stored.

**Data flow for a single-photo sighting upload:**
```
Client (curl / mobile)
  → POST /api/v1/sightings (multipart: file + lat/lng + disease_tags + notes)
  → Backend resizes image to 224×224 with Pillow
  → Original uploaded to Cloud Storage: sightings/{id}/photo.jpg
  → Resized uploaded to Cloud Storage: sightings/{id}/photo_224.jpg
  → Metadata written to Firestore: sightings/{id}
  → Response returned with all fields + signed URL
```

**Data flow for the full pipeline (multi-photo upload + embed + match):**
```
Client (mobile / curl)
  → POST /api/v1/sightings/pipeline (multipart: files[] + lat/lng + notes + disease_tags)
  → For each photo: upload original + resize to 224×224 + POST to ML /embed
  → Average all embeddings (element-wise mean, L2-normalize with numpy)
  → Store sighting in Firestore with averaged embedding + all photo paths
  → Fetch all other sightings with non-null embeddings from Firestore
  → Compute cosine similarity (numpy dot product of L2-normalized vectors)
  → Filter candidates ≥ 0.7 threshold, sort descending
  → If matches: write matches/{sighting_id} doc, set status "matched"
  → If no matches: set status "no_match"
  → Return PipelineResponse with sighting data + match candidates + signed URLs
```

**Mobile wiring:** The camera screen uses `expo-location` to get GPS on upload, calls `uploadSighting()` from `mobile/src/api/client.ts` (fetch + FormData), then navigates to `/match-results` passing the `PipelineResponse` as a JSON route param. The match-results screen parses this and renders real candidates (or falls back to mock data if no param).

**Data flow for a field match (future, async version):**
```
Field Worker (mobile)
  → uploads photo to Cloud Storage
  → triggers Storage Cloud Function
  → Function enqueues ML similarity job
  → ML pipeline returns top-N candidate IDs + scores
  → Results written to Firestore
  → Mobile listens via Firestore snapshot → presents candidates for human confirmation
```

**Offline-first considerations:**
- Mobile should queue photo captures locally if offline and sync when connectivity resumes.
- Never assume immediate Function response in the mobile UX.

---

## Firestore Schema

```
profiles/{profile_id}
    name, species, sex, breed, color_description,
    distinguishing_features, estimated_age_months,
    location_found (GeoPoint), notes,
    photo_count (int), created_at, updated_at

    photos/{photo_id}          # subcollection (NOT an array on the profile doc)
        storage_path, uploaded_at

sightings/{sighting_id}       # doc ID = same UUID used in storage paths
    photo_storage_path              ← original image (first photo, for backward compat)
    photo_resized_storage_path      ← 224×224 ML-ready image (first photo)
    photo_storage_paths (array)     ← all original images (pipeline endpoint)
    photo_resized_storage_paths (array) ← all resized images (pipeline endpoint)
    location (GeoPoint)
    disease_tags (array of strings) ← e.g. ["rabies", "mange"]
    notes (string)
    image_width (int)               ← always 224 (resized dimensions)
    image_height (int)              ← always 224
    embedding (array of 32 floats, nullable) ← ML embedding vector (averaged across photos, L2-normalized)
    model_version (string, nullable)         ← e.g. "dogfacenet_v1_random"
    status ("pending"|"processing"|"matched"|"no_match")
    created_at, updated_at

matches/{sighting_id}          # doc ID = sighting ID (1:1 relationship)
    sighting_id, candidates [{sighting_id, score}],
    status ("pending"|"confirmed"|"rejected"),
    confirmed_profile_id, created_at, updated_at
```

**Disease tag enum values:** `rabies`, `mange`, `distemper`, `parvovirus`, `other` (defined in `backend/models/common.py:DiseaseTag`)

## Cloud Storage Paths
```
profiles/{profile_id}/photos/{photo_id}.jpg
sightings/{sighting_id}/photo.jpg          ← original upload (single-photo endpoint)
sightings/{sighting_id}/photo_224.jpg      ← 224×224 resized for ML (single-photo endpoint)
sightings/{sighting_id}/photo_{i}.jpg      ← original upload (pipeline endpoint, i=0,1,2...)
sightings/{sighting_id}/photo_{i}_224.jpg  ← 224×224 resized (pipeline endpoint)
```

---

## Backend API Conventions

- **Port assignment:** Backend API = 8001, ML embed service = 8000. These must not collide.
- **API prefix:** All endpoints under `/api/v1/`. Swagger docs at `/docs`.
- **Pagination:** Cursor-based using Firestore document IDs (`start_after`). Never use offset pagination with Firestore.
- **Photos:** Stored as a Firestore subcollection (`profiles/{id}/photos/{photo_id}`), max 5 per profile. Enforced server-side.
- **Signed URLs:** In production, Cloud Storage generates signed URLs (default 60 min expiration). In emulator mode, direct emulator URLs are returned instead (emulator doesn't support signed URLs).
- **Config:** All backend config via `.env` file at project root, loaded by pydantic-settings. All vars prefixed `STRAY_` (e.g., `STRAY_STORAGE_BUCKET`). See `backend/config.py`.
- **Sighting IDs:** The router generates a UUID used for both the Firestore doc ID and the Storage path. This ensures the sighting ID in the API response matches the Storage folder name. Do not use Firestore auto-IDs (`.add()`) for sightings — use `.document(id).set()`.
- **Image resizing:** All uploaded sighting images are resized to 224x224 with Pillow (`Image.LANCZOS`) before storing the resized copy. Both original and resized are kept.
- **Disease tags:** Accepted as a comma-separated string in the multipart form (e.g., `disease_tags=rabies,mange`) since HTML form data doesn't natively support arrays.
- **No auth yet:** Endpoint structure supports middleware addition later. Do not add auth stubs or decorators prematurely.
- **Pipeline endpoint:** `POST /api/v1/sightings/pipeline` accepts multiple files, embeds each via ML service, averages embeddings (L2-normalized), and runs cosine similarity matching — all synchronously. Returns `PipelineResponse` with match candidates. The single-photo `POST /api/v1/sightings` endpoint remains unchanged for backward compatibility.
- **Similarity threshold:** Match candidates must have cosine similarity ≥ 0.7 to be included. Both query and candidate embeddings are L2-normalized before dot product.
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
- **Mobile API client:** `mobile/src/api/client.ts` uses `fetch` + `FormData` (no axios/external lib). Photo URIs are appended as `{ uri, name, type }` objects cast to `Blob` — this is the React Native FormData convention. Base URL defaults to `http://localhost:8001` in dev.
- **Mobile route params:** Large data (like `PipelineResponse`) is passed between screens as JSON-serialized route params via `router.push({ params: { key: JSON.stringify(data) } })` and parsed with `useLocalSearchParams`.
- **expo-location:** Used to get GPS coordinates on upload. Permission is requested lazily (only when user taps Upload, not on screen mount).

---

## Common Pitfalls to Avoid

- Don't put similarity search calls inside synchronous HTTP callables — ML is async by nature.
- Don't skip `storage.rules` updates when adding new Storage paths.
- Don't hardcode animal/clinic IDs in tests — use fixtures.
- Don't assume the mobile camera always returns a consistent image format; normalize before embedding.
- Don't expose raw Firestore document IDs as the sole animal identifier in the mobile UI — these are internal keys.
- ⚠️ **Confirmed:** Don't use Firestore `.add()` for sightings — it generates a different ID than the one used in Storage paths, causing ID mismatches between the API response and stored files. Use `.document(id).set()` instead.
- ⚠️ **Confirmed:** Don't use fake JPEG bytes in tests (e.g., `io.BytesIO(b"\xff\xd8\xff\xe0fake")`) — Pillow cannot open them and the resize step will crash. Use `PIL.Image.new()` to generate valid test images.
- ⚠️ **Confirmed:** The `.env` file must use `KEY=VALUE` format only — no `export` keyword, no shell commands, no line-wrapped values. pydantic-settings parses it directly, not through a shell.
- ⚠️ **Confirmed:** `STRAY_FIREBASE_CREDENTIALS_PATH` must be an absolute path. Relative paths (e.g., `./file.json`) may fail depending on the working directory when uvicorn starts.
- Don't confuse Firebase **Realtime Database** with **Cloud Firestore** — they are completely separate products. This project uses Cloud Firestore only. The service account key covers both, but the API must be enabled separately in the Firebase Console.
