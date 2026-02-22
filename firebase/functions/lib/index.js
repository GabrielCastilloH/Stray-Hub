"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.onProfileDeleted = void 0;
const admin = require("firebase-admin");
const firestore_1 = require("firebase-functions/v2/firestore");
admin.initializeApp();
/**
 * When a profile document is deleted, clean up:
 * - All photos in the photos subcollection
 * - All Storage files under profiles/{profileId}/photos/
 */
exports.onProfileDeleted = (0, firestore_1.onDocumentDeleted)("profiles/{profileId}", async (event) => {
    const profileId = event.params.profileId;
    if (!profileId)
        return;
    const db = admin.firestore();
    const bucket = admin.storage().bucket();
    // Delete photos subcollection
    const photosRef = db.collection("profiles").doc(profileId).collection("photos");
    const photosSnap = await photosRef.get();
    const batch = db.batch();
    photosSnap.docs.forEach((doc) => batch.delete(doc.ref));
    await batch.commit();
    // Delete Storage files under profiles/{profileId}/photos/
    const prefix = `profiles/${profileId}/photos/`;
    const [files] = await bucket.getFiles({ prefix });
    await Promise.all(files.map((file) => file.delete()));
});
