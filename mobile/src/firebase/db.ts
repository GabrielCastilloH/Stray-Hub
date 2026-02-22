import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  collection,
  getDocs,
  query,
  orderBy,
  arrayUnion,
  increment,
  serverTimestamp,
  runTransaction,
  GeoPoint,
  Timestamp,
} from "firebase/firestore";
import { db } from "./config";
import { getPhotoUrl } from "./storage";
import type { FirestorePhoto, ProfileResponse } from "@/types/api";

function geoFromFirestore(
  geo: GeoPoint | null | undefined
): { latitude: number; longitude: number } | null {
  if (!geo) return null;
  return { latitude: geo.latitude, longitude: geo.longitude };
}

function timestampToIso(ts: Timestamp | Date | null): string {
  if (!ts) return "";
  const d = ts instanceof Date ? ts : ts.toDate();
  return d.toISOString();
}

export async function getProfile(profileId: string): Promise<ProfileResponse | null> {
  const profileRef = doc(db, "profiles", profileId);
  const profileSnap = await getDoc(profileRef);
  if (!profileSnap.exists()) return null;

  const data = profileSnap.data();
  const photosSnap = await getDocs(
    query(
      collection(db, "profiles", profileId, "photos"),
      orderBy("uploaded_at")
    )
  );

  const photos: FirestorePhoto[] = photosSnap.docs.map((p) => {
    const pdata = p.data();
    const storagePath = pdata.storage_path as string;
    return {
      photo_id: p.id,
      storage_path: storagePath,
      download_url: getPhotoUrl(storagePath),
      uploaded_at: timestampToIso(pdata.uploaded_at),
      angle: pdata.angle ?? null,
    };
  });

  const locFound = data.location_found as GeoPoint | undefined;
  const lastSeen = data.last_seen_location as GeoPoint | undefined;
  const sightingsRaw = (data.sightings ?? []) as Array<{ timestamp: Timestamp; location: GeoPoint }>;
  const sightings = sightingsRaw.map((s) => ({
    timestamp: timestampToIso(s.timestamp),
    location: geoFromFirestore(s.location)!,
  }));

  return {
    id: profileSnap.id,
    name: data.name ?? "Unknown",
    species: data.species ?? "dog",
    sex: data.sex ?? "unknown",
    breed: data.breed ?? "",
    color_description: data.color_description ?? "",
    distinguishing_features: data.distinguishing_features ?? "",
    estimated_age_months: data.estimated_age_months ?? null,
    location_found: geoFromFirestore(locFound),
    notes: data.notes ?? "",
    photo_count: data.photo_count ?? 0,
    photos,
    created_at: timestampToIso(data.created_at),
    updated_at: timestampToIso(data.updated_at),
    embedding: data.embedding ?? null,
    model_version: data.model_version ?? null,
    sightings,
    last_seen_location: geoFromFirestore(lastSeen),
    last_seen_at: data.last_seen_at ? timestampToIso(data.last_seen_at) : null,
    age_estimate: data.age_estimate ?? "",
    primary_color: data.primary_color ?? "",
    microchip_id: data.microchip_id ?? "",
    collar_tag_id: data.collar_tag_id ?? "",
    neuter_status: data.neuter_status ?? "",
    surgery_date: data.surgery_date ?? "",
    rabies: data.rabies ?? {},
    dhpp: data.dhpp ?? {},
    bite_risk: data.bite_risk ?? "",
    diseases: (data.diseases ?? []) as { name: string; status: string }[],
    clinic_name: data.clinic_name ?? "",
    intake_location: data.intake_location ?? "",
    release_location: data.release_location ?? "",
    profile_number: data.profile_number ?? null,
  };
}

export async function listProfiles(): Promise<ProfileResponse[]> {
  const profilesSnap = await getDocs(
    query(collection(db, "profiles"), orderBy("created_at", "desc"))
  );

  const profiles = await Promise.all(
    profilesSnap.docs.map(async (profileDoc) => {
      const data = profileDoc.data();
      const profileId = profileDoc.id;
      const photosSnap = await getDocs(
        query(
          collection(db, "profiles", profileId, "photos"),
          orderBy("uploaded_at")
        )
      );
      const photos: FirestorePhoto[] = photosSnap.docs.map((p) => {
        const pdata = p.data();
        const storagePath = pdata.storage_path as string;
        return {
          photo_id: p.id,
          storage_path: storagePath,
          download_url: getPhotoUrl(storagePath),
          uploaded_at: timestampToIso(pdata.uploaded_at),
          angle: pdata.angle ?? null,
        };
      });

      const locFound = data.location_found as GeoPoint | undefined;
      const lastSeen = data.last_seen_location as GeoPoint | undefined;
      const sightingsRaw = (data.sightings ?? []) as Array<{
        timestamp: Timestamp;
        location: GeoPoint;
      }>;
      const sightings = sightingsRaw.map((s) => ({
        timestamp: timestampToIso(s.timestamp),
        location: geoFromFirestore(s.location)!,
      }));

      return {
        id: profileId,
        name: data.name ?? "Unknown",
        species: data.species ?? "dog",
        sex: data.sex ?? "unknown",
        breed: data.breed ?? "",
        color_description: data.color_description ?? "",
        distinguishing_features: data.distinguishing_features ?? "",
        estimated_age_months: data.estimated_age_months ?? null,
        location_found: geoFromFirestore(locFound),
        notes: data.notes ?? "",
        photo_count: data.photo_count ?? 0,
        photos,
        created_at: timestampToIso(data.created_at),
        updated_at: timestampToIso(data.updated_at),
        embedding: data.embedding ?? null,
        model_version: data.model_version ?? null,
        sightings,
        last_seen_location: geoFromFirestore(lastSeen),
        last_seen_at: data.last_seen_at ? timestampToIso(data.last_seen_at) : null,
        age_estimate: data.age_estimate ?? "",
        primary_color: data.primary_color ?? "",
        microchip_id: data.microchip_id ?? "",
        collar_tag_id: data.collar_tag_id ?? "",
        neuter_status: data.neuter_status ?? "",
        surgery_date: data.surgery_date ?? "",
        rabies: data.rabies ?? {},
        dhpp: data.dhpp ?? {},
        bite_risk: data.bite_risk ?? "",
        diseases: (data.diseases ?? []) as { name: string; status: string }[],
        clinic_name: data.clinic_name ?? "",
        intake_location: data.intake_location ?? "",
        release_location: data.release_location ?? "",
        profile_number: data.profile_number ?? null,
      };
    })
  );

  profiles.sort((a, b) => {
    const aNum = a.profile_number ?? Infinity;
    const bNum = b.profile_number ?? Infinity;
    return aNum - bNum;
  });
  return profiles;
}

export async function confirmSighting(
  profileId: string,
  latitude: number,
  longitude: number
): Promise<void> {
  const profileRef = doc(db, "profiles", profileId);
  const geo = new GeoPoint(latitude, longitude);
  const entry = { timestamp: serverTimestamp(), location: geo };
  await updateDoc(profileRef, {
    sightings: arrayUnion(entry),
    last_seen_location: geo,
    last_seen_at: serverTimestamp(),
    updated_at: serverTimestamp(),
  });
}

export interface CreateProfileData {
  name?: string;
  species?: string;
  sex?: string;
  age_estimate?: string;
  primary_color?: string;
  microchip_id?: string;
  collar_tag_id?: string;
  neuter_status?: string;
  surgery_date?: string;
  rabies?: Record<string, unknown>;
  dhpp?: Record<string, unknown>;
  bite_risk?: string;
  diseases?: { name: string; status: string }[];
  clinic_name?: string;
  intake_location?: string;
  release_location?: string;
  notes?: string;
}

export async function createProfile(profileId: string, data: CreateProfileData): Promise<void> {
  const profileRef = doc(db, "profiles", profileId);
  const counterRef = doc(db, "counters", "profiles");

  await runTransaction(db, async (transaction) => {
    const counterSnap = await transaction.get(counterRef);
    const currentCount = counterSnap.exists() ? (counterSnap.data()?.count ?? 0) : 0;
    const nextNum = currentCount + 1;

    transaction.set(counterRef, { count: nextNum }, { merge: true });
    transaction.set(profileRef, {
      name: data.name ?? "Unknown",
      species: data.species ?? "dog",
      sex: data.sex ?? "unknown",
      breed: "",
      color_description: "",
      distinguishing_features: "",
      estimated_age_months: null,
      location_found: null,
      notes: data.notes ?? "",
      photo_count: 0,
      face_photo_id: null,
      has_embedding: false,
      age_estimate: data.age_estimate ?? "",
      primary_color: data.primary_color ?? "",
      microchip_id: data.microchip_id ?? "",
      collar_tag_id: data.collar_tag_id ?? "",
      neuter_status: data.neuter_status ?? "",
      surgery_date: data.surgery_date ?? "",
      rabies: data.rabies ?? {},
      dhpp: data.dhpp ?? {},
      bite_risk: data.bite_risk ?? "",
      diseases: data.diseases ?? [],
      clinic_name: data.clinic_name ?? "",
      intake_location: data.intake_location ?? "",
      release_location: data.release_location ?? "",
      sightings: [],
      last_seen_location: null,
      last_seen_at: null,
      profile_number: nextNum,
      created_at: serverTimestamp(),
      updated_at: serverTimestamp(),
    });
  });
}

export async function updateProfileEmbedding(
  profileId: string,
  embedding: number[],
  modelVersion: string
): Promise<void> {
  const profileRef = doc(db, "profiles", profileId);
  await updateDoc(profileRef, {
    embedding,
    model_version: modelVersion,
    has_embedding: true,
    updated_at: serverTimestamp(),
  });
}

export async function addPhotoMeta(
  profileId: string,
  photoId: string,
  storagePath: string,
  angle?: string
): Promise<void> {
  const photoRef = doc(db, "profiles", profileId, "photos", photoId);
  const profileRef = doc(db, "profiles", profileId);
  const now = new Date();

  await setDoc(photoRef, {
    storage_path: storagePath,
    uploaded_at: now,
    ...(angle && { angle }),
  });

  const updateData: Record<string, unknown> = {
    photo_count: increment(1),
    updated_at: now,
  };
  if (angle === "face") {
    updateData.face_photo_id = photoId;
  }
  await updateDoc(profileRef, updateData);
}
