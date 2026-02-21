import Constants from "expo-constants";
import { Platform } from "react-native";
import { PipelineResponse } from "@/types/api";

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

  // On a physical device, Expo's dev server hostname is our best bet
  // for reaching the same machine that's running uvicorn.
  const debuggerHost =
    Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;

  if (debuggerHost) {
    const host = debuggerHost.split(":")[0]; // strip Expo's port
    return `http://${host}:8001`;
  }

  // Fallbacks
  if (Platform.OS === "android") {
    return "http://10.0.2.2:8001";
  }
  return "http://localhost:8001";
}

const API_BASE_URL = getBaseUrl();

export async function uploadSighting(
  photoUris: string[],
  latitude: number,
  longitude: number,
  notes?: string,
  diseaseTags?: string,
): Promise<PipelineResponse> {
  const url = `${API_BASE_URL}/api/v1/sightings/pipeline`;
  console.log("[API] uploadSighting →", url);
  console.log("[API] photos:", photoUris.length, "coords:", latitude, longitude);

  const formData = new FormData();

  for (const uri of photoUris) {
    const filename = uri.split("/").pop() ?? "photo.jpg";
    console.log("[API] appending file:", filename, "uri:", uri.slice(0, 80));
    formData.append("files", {
      uri,
      name: filename,
      type: "image/jpeg",
    } as unknown as Blob);
  }

  formData.append("latitude", latitude.toString());
  formData.append("longitude", longitude.toString());
  if (notes) formData.append("notes", notes);
  if (diseaseTags) formData.append("disease_tags", diseaseTags);

  try {
    console.log("[API] sending fetch...");
    const response = await fetch(url, {
      method: "POST",
      body: formData,
    });

    console.log("[API] response status:", response.status);

    if (!response.ok) {
      const text = await response.text();
      console.error("[API] error body:", text);
      throw new Error(`Upload failed (${response.status}): ${text}`);
    }

    const json = await response.json();
    console.log("[API] success, sighting_id:", json.id);
    return json;
  } catch (err) {
    console.error("[API] fetch error:", err);
    throw err;
  }
}
