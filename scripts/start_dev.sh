#!/usr/bin/env bash
# Start Firebase emulators + backend API for local development.
# Usage: ./scripts/start_dev.sh

set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Firebase emulator env vars — the SDKs detect these automatically.
export FIRESTORE_EMULATOR_HOST="127.0.0.1:8080"
export FIREBASE_STORAGE_EMULATOR_HOST="127.0.0.1:9199"
export STRAY_STORAGE_BUCKET="stray-hub-dev.appspot.com"

echo "==> Starting Firebase emulators in background..."
cd "$PROJECT_ROOT"
firebase emulators:start --project stray-hub-dev &
EMULATOR_PID=$!

# Give emulators a moment to boot
sleep 4

echo "==> Starting backend API on port 8001..."
uvicorn backend.main:app --port 8001 --reload &
BACKEND_PID=$!

cleanup() {
  echo ""
  echo "==> Shutting down..."
  kill "$BACKEND_PID" 2>/dev/null || true
  kill "$EMULATOR_PID" 2>/dev/null || true
  wait
}
trap cleanup EXIT INT TERM

echo ""
echo "  Emulator UI:  http://127.0.0.1:4000"
echo "  Backend API:   http://127.0.0.1:8001/docs"
echo ""
echo "Press Ctrl+C to stop all services."
wait
