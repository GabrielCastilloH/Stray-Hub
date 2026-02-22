import Constants from "expo-constants";
import { Platform } from "react-native";
import type { ProfileResponse, SearchResponse } from "@/types/api";

/**
 * Resolve the backend URL.
 * - iOS simulator: localhost works
 * - Android emulator: 10.0.2.2 is the host loopback
 * - Physical device: needs the dev server's LAN IP — Expo exposes this via the manifest
 */
function getBaseUrl(): string {
  if (!__DEV__) {
    return "http://localhost:8001"; // TODO: production URL
  }

  const debuggerHost =
    Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;

  if (debuggerHost) {
    const host = debuggerHost.split(":")[0];
    return `http://${host}:8001`;
  }

  if (Platform.OS === "android") {
    return "http://10.0.2.2:8001";
  }
  return "http://localhost:8001";
}

const API_BASE_URL = getBaseUrl();

export async function searchMatch(
  photoUris: string[],
  latitude: number,
  longitude: number,
): Promise<SearchResponse> {
  const url = `${API_BASE_URL}/api/v1/search/match`;
  console.log("[API] searchMatch →", url);

  const formData = new FormData();
  for (const uri of photoUris) {
    const filename = uri.split("/").pop() ?? "photo.jpg";
    formData.append("files", {
      uri,
      name: filename,
      type: "image/jpeg",
    } as unknown as Blob);
  }
  formData.append("latitude", latitude.toString());
  formData.append("longitude", longitude.toString());

  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Search failed (${response.status}): ${text}`);
  }
  return response.json();
}

export async function getProfile(profileId: string): Promise<ProfileResponse> {
  const url = `${API_BASE_URL}/api/v1/profiles/${profileId}`;
  const response = await fetch(url);
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Profile fetch failed (${response.status}): ${text}`);
  }
  return response.json();
}

export async function confirmSighting(
  profileId: string,
  latitude: number,
  longitude: number,
): Promise<ProfileResponse> {
  const url = `${API_BASE_URL}/api/v1/profiles/${profileId}/confirm-sighting`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ latitude, longitude }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Confirm failed (${response.status}): ${text}`);
  }
  return response.json();
}

export interface VetIntakeFormData {
  photos: { uri: string; angle: string }[];
  name: string;
  sex: string;
  ageEstimate: string;
  primaryColor: string;
  microchipId: string;
  collarTagId: string;
  neuterStatus: string;
  surgeryDate: string;
  rabiesStatus: string;
  rabiesDateAdmin: string;
  rabiesExpiry: string;
  rabiesBatch: string;
  dhppStatus: string;
  dhppDate: string;
  biteRisk: string;
  diseases: { name: string; status: string }[];
  clinicName: string;
  intakeLocation: string;
  releaseLocation: string;
  notes: string;
}

export async function submitVetIntake(data: VetIntakeFormData): Promise<ProfileResponse> {
  const url = `${API_BASE_URL}/api/v1/profiles/intake`;
  const formData = new FormData();

  for (const p of data.photos) {
    const filename = p.uri.split("/").pop() ?? "photo.jpg";
    formData.append("files", {
      uri: p.uri,
      name: filename,
      type: "image/jpeg",
    } as unknown as Blob);
  }
  formData.append("angles", data.photos.map((p) => p.angle).join(","));
  formData.append("name", data.name || "Unknown");
  formData.append("sex", data.sex || "unknown");
  formData.append("age_estimate", data.ageEstimate);
  formData.append("primary_color", data.primaryColor);
  formData.append("microchip_id", data.microchipId);
  formData.append("collar_tag_id", data.collarTagId);
  formData.append("neuter_status", data.neuterStatus);
  formData.append("surgery_date", data.surgeryDate);
  formData.append("rabies_status", data.rabiesStatus);
  formData.append("rabies_date_admin", data.rabiesDateAdmin);
  formData.append("rabies_expiry", data.rabiesExpiry);
  formData.append("rabies_batch", data.rabiesBatch);
  formData.append("dhpp_status", data.dhppStatus);
  formData.append("dhpp_date", data.dhppDate);
  formData.append("bite_risk", data.biteRisk);
  formData.append("diseases_json", JSON.stringify(data.diseases));
  formData.append("clinic_name", data.clinicName);
  formData.append("intake_location", data.intakeLocation);
  formData.append("release_location", data.releaseLocation);
  formData.append("notes", data.notes);

  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vet intake failed (${response.status}): ${text}`);
  }
  return response.json();
}
