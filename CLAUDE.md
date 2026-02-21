# CLAUDE.md

## Project

Stray Hub — a computer-vision platform for coordinating stray animal catch-and-release. Clinics create biometric profiles from multi-angle photos; field workers snap a photo and an AI vector similarity search surfaces matches for human confirmation.

## Structure

- `firebase/` — Backend. Cloud Functions (TypeScript), Firestore, Cloud Storage.
- `mobile/` — Expo (React Native) mobile app.
- `ml/` — Python ML pipeline: image embeddings, vector index, similarity search.
- `scripts/` — One-off Python utility scripts.

## Stack

- **Mobile:** Expo / React Native
- **Backend:** Firebase Cloud Functions (TypeScript, Node 18)
- **Database:** Cloud Firestore
- **Storage:** Firebase Cloud Storage
- **ML:** Python (vector embeddings + similarity search)

## Commands

- **Functions:** `cd firebase/functions && npm run build` (compile), `npm run serve` (emulator)
- **Mobile:** `cd mobile && npm start`
- **ML:** `cd ml && pip install -r requirements.txt`

## Conventions

- TypeScript for Firebase, Python for ML and scripts.
- snake_case for Python files, camelCase for TypeScript.
- Firebase endpoints are `functions.https.onCall` callables.
- Never commit `.env` files or model weights (`.pt`, `.pth`, `.onnx`, `.h5`, `.pkl`).
- When adding features that touch data, update `firestore.rules` and `storage.rules`.
- Prefer ESLint + Prettier for TS, Ruff for Python if adding linting.
- Tests: Jest for TypeScript, pytest for Python.
