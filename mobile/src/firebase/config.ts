import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import {
  getFirestore,
  connectFirestoreEmulator,
  Firestore,
} from "firebase/firestore";
import {
  getStorage,
  connectStorageEmulator,
  FirebaseStorage,
} from "firebase/storage";

/**
 * Firebase config — loaded from env (see mobile/.env.example)
 */
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY ?? "",
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "",
  databaseURL: process.env.EXPO_PUBLIC_FIREBASE_DATABASE_URL ?? "",
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID ?? "",
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "",
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID ?? "",
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID ?? "",
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_MEASUREMENT_ID ?? "",
};

// Initialize Firebase

function getApp(): FirebaseApp {
  const existing = getApps()[0];
  if (existing) return existing;
  return initializeApp(firebaseConfig);
}

export const app = getApp();
export const db: Firestore = getFirestore(app);
export const storage: FirebaseStorage = getStorage(app);

if (__DEV__) {
  try {
    connectFirestoreEmulator(db, "127.0.0.1", 8080);
    connectStorageEmulator(storage, "127.0.0.1", 9199);
  } catch {
    // Emulator not running — will use production Firebase
  }
}
