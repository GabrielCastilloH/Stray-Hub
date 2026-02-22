# Stray Hub

Snap a photo of a stray → AI finds matching profiles. Clinics register animals with photos + health records. Field workers identify them in the wild.

## Stack

- **Mobile:** Expo / React Native — Firebase JS SDK for data, backend for ML only
- **Backend:** FastAPI (Python, port 8001) — search/match + embed endpoints
- **ML:** DogFaceNet (Python, port 8000) — 32-dim embeddings, 224x224 input
- **Database:** Cloud Firestore
- **Storage:** Firebase Cloud Storage

## Structure

```
mobile/    — Expo app
backend/   — FastAPI (ML proxy + search)
ml/        — DogFaceNet embed service
firebase/  — rules + Cloud Functions
scripts/   — rebuild profiles, backups
```

## Run

```bash
cd mobile && npm start                             # app
uvicorn backend.main:app --port 8001 --reload      # backend (from project root)
cd ml && python embed_service.py                   # ML
python scripts/rebuild_profiles_from_photos.py     # wipe + rebuild profiles
```

## Rules

- No signed URLs — direct Firebase Storage URLs everywhere
- Profile IDs: UUID hex, `.document(id).set()`, never `.add()`
- `diseases` field: `[{name, status}]` dicts, not strings
- Never commit `.env`, model weights, or service account keys
- Python: `snake_case` files. TypeScript: `camelCase` files.

---
*Keep this file short and up to date.*
