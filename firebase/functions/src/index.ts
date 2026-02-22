import * as functions from "firebase-functions";

/**
 * CLOUD FUNCTIONS: SCAFFOLDING STUBS (UNUSED)
 *
 * These functions are placeholder stubs only. All business logic currently lives
 * in the FastAPI backend (port 8001). The mobile app and API clients talk to the
 * backend directly, not to these callables.
 *
 * Before production: either implement these (e.g. for Storage-triggered ML jobs,
 * Firebase Auth callable flows) or remove them entirely.
 */
export const createProfile = functions.https.onCall((data, context) => {
  return { placeholder: true };
});

export const uploadDone = functions.https.onCall((data, context) => {
  return { placeholder: true };
});

export const match = functions.https.onCall((data, context) => {
  return { placeholder: true };
});

export const feedback = functions.https.onCall((data, context) => {
  return { placeholder: true };
});
