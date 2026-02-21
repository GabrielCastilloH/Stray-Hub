/** Shared ref so the tab-bar camera button can trigger capture while on the camera screen. */
export const captureRef: { current: (() => void) | null } = { current: null };
