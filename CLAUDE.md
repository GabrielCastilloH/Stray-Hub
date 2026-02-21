# CLAUDE.md
## Project Shrub (Stray Hub)
A computer-vision platform for coordinating stray animal catch-and-release programs.
Clinics create biometric profiles from multi-angle photos; field workers snap a photo
and an AI vector similarity search surfaces matches for human confirmation.

---

## 🧠 How Claude Should Work on This Project

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

---

## Commands
```bash
# Backend API
cd backend && pip install -r requirements.txt
uvicorn backend.main:app --port 8001 --reload   # run from project root

# Functions
cd firebase/functions && npm run build      # compile
cd firebase/functions && npm run serve      # local emulator

# Mobile
cd mobile && npm start

# ML
cd ml && pip install -r requirements.txt
```

---

## Architecture Principles

**Layering rules — where logic lives:**
- Biometric embedding generation → `ml/` only. Never in Functions or mobile.
- Vector similarity search → `ml/` pipeline, triggered async. Functions should not block on ML.
- Identity match confirmation → human-in-the-loop via mobile UI. Never auto-confirm in code.
- Auth and authorization → Cloud Functions with Firebase Auth context. Mobile never trusts itself.
- Image upload → mobile uploads directly to Cloud Storage; Functions validate post-upload via Storage triggers.

**Data flow for a field match:**
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

sightings/{sighting_id}
    photo_storage_path, location (GeoPoint),
    notes, status ("pending"|"processing"|"matched"|"no_match"),
    created_at, updated_at

matches/{sighting_id}          # doc ID = sighting ID (1:1 relationship)
    sighting_id, candidates [{profile_id, score}],
    status ("pending"|"confirmed"|"rejected"),
    confirmed_profile_id, created_at, updated_at
```

## Cloud Storage Paths
```
profiles/{profile_id}/photos/{photo_id}.jpg
sightings/{sighting_id}/photo.jpg
```

---

## Backend API Conventions

- **Port assignment:** Backend API = 8001, ML embed service = 8000. These must not collide.
- **API prefix:** All endpoints under `/api/v1/`. Swagger docs at `/docs`.
- **Pagination:** Cursor-based using Firestore document IDs (`start_after`). Never use offset pagination with Firestore.
- **Photos:** Stored as a Firestore subcollection (`profiles/{id}/photos/{photo_id}`), max 5 per profile. Enforced server-side.
- **Signed URLs:** Cloud Storage is locked down; the API generates signed URLs (default 60 min expiration) for reads.
- **Config:** All backend config via env vars prefixed `STRAY_` (e.g., `STRAY_STORAGE_BUCKET`). See `backend/config.py`.
- **No auth yet:** Endpoint structure supports middleware addition later. Do not add auth stubs or decorators prematurely.
- **No ML calls from backend API:** Sightings just store data. ML pipeline wiring comes later via Cloud Function triggers.

---

## Conventions

- **Language:** TypeScript for Firebase functions; Python for ML, backend API, and scripts.
- **Naming:** `snake_case` for Python files; `camelCase` for TypeScript files.
- **Firebase endpoints:** Always `functions.https.onCall` callables with explicit `context.auth` checks.
- **Security:** Every feature touching data must update `firestore.rules` and `storage.rules`. Never skip this.
- **Secrets:** Never commit `.env` files or model weights (`.pt`, `.pth`, `.onnx`, `.h5`, `.pkl`).
- **Linting:** ESLint + Prettier for TypeScript; Ruff for Python.
- **Tests:** Jest for TypeScript; pytest for Python. New features should include at least a smoke test.
- **ML schema changes:** Any change to embedding dimensions, vector index schema, or image preprocessing must be noted in `ml/SCHEMA_CHANGELOG.md` to avoid silent pipeline breakage.

---

## Common Pitfalls to Avoid

- Don't put similarity search calls inside synchronous HTTP callables — ML is async by nature.
- Don't skip `storage.rules` updates when adding new Storage paths.
- Don't hardcode animal/clinic IDs in tests — use fixtures.
- Don't assume the mobile camera always returns a consistent image format; normalize before embedding.
- Don't expose raw Firestore document IDs as the sole animal identifier in the mobile UI — these are internal keys.