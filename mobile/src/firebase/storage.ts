import { ref, uploadBytes } from "firebase/storage";
import { app, storage } from "./config";

const BUCKET = app.options.storageBucket ?? "stray-hub.firebasestorage.app";

/**
 * Construct direct download URL from storage path (no signed URLs).
 */
export function getPhotoUrl(storagePath: string): string {
  const encoded = encodeURIComponent(storagePath);
  return `https://firebasestorage.googleapis.com/v0/b/${BUCKET}/o/${encoded}?alt=media`;
}

/**
 * Upload photo from local file URI to Storage.
 */
export async function uploadPhoto(
  profileId: string,
  photoId: string,
  fileUri: string
): Promise<string> {
  const response = await fetch(fileUri);
  const blob = await response.blob();
  const path = `profiles/${profileId}/photos/${photoId}.jpg`;
  const storageRef = ref(storage, path);
  await uploadBytes(storageRef, blob, { contentType: "image/jpeg" });
  return path;
}
