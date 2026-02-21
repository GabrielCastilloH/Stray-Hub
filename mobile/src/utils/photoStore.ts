/**
 * Module-level ref so the photo-viewer screen can delete photos
 * whose state lives in camera.tsx.  Same pattern as captureRef.
 */
export const deletePhotoRef: { current: ((id: string) => void) | null } = {
  current: null,
};
