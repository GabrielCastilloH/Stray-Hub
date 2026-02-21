# CLAUDE.md

## Project

Stray Hub — an AI-powered biometric data hub for stray populations. Current stray management efforts—from catch-and-release programs to disease control—suffer from fragmented data and poor animal identification. By simply snapping a photo of a stray, field workers trigger a computer vision similarity search that instantly pulls up a comprehensive profile. This single interaction feeds multiple critical use cases: it immediately verifies an animal's CNVR (Catch, Neuter, Vaccinate, Return) status to prevent redundant recaptures, while simultaneously aggregating geotagged health metrics. Ultimately, this centralized platform empowers organizations to conserve veterinary resources, map disease hotspots in real-time, and shift from reactive treatments to proactive outbreak prevention.

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
