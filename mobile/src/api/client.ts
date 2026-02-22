import Constants from "expo-constants";
import { Platform } from "react-native";
import type { SearchResponse } from "@/types/api";

/**
 * Resolve the backend URL.
 * - iOS simulator: localhost works
 * - Android emulator: 10.0.2.2 is the host loopback
 * - Physical device: needs the dev server's LAN IP — Expo exposes this via the manifest
 */
function getBaseUrl(): string {
  console.log("[API] __DEV__:", __DEV__);
  console.log("[API] Platform.OS:", Platform.OS);
  console.log("[API] Constants.expoConfig?.hostUri:", Constants.expoConfig?.hostUri);
  console.log("[API] Constants.manifest2?.extra?.expoGo?.debuggerHost:", Constants.manifest2?.extra?.expoGo?.debuggerHost);

  if (!__DEV__) {
    return "https://stray-hub-backend-1071948249512.us-central1.run.app";
  }

  const debuggerHost =
    Constants.expoConfig?.hostUri ?? Constants.manifest2?.extra?.expoGo?.debuggerHost;

  console.log("[API] resolved debuggerHost:", debuggerHost);

  if (debuggerHost) {
    const host = debuggerHost.split(":")[0];
    console.log("[API] extracted host:", host);
    return `http://${host}:8001`;
  }

  if (Platform.OS === "android") {
    console.log("[API] falling back to Android emulator host");
    return "http://10.0.2.2:8001";
  }
  console.log("[API] falling back to localhost");
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

  console.log("[API] fetch →", url, "files:", photoUris.length, "lat:", latitude, "lon:", longitude);
  let response: Response;
  try {
    response = await fetch(url, { method: "POST", body: formData });
  } catch (netErr) {
    console.error("[API] fetch network error (likely unreachable host):", netErr);
    console.error("[API] resolved base URL was:", API_BASE_URL);
    throw netErr;
  }
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Search failed (${response.status}): ${text}`);
  }
  return response.json();
}

export interface EmbedResponse {
  embedding: number[];
  model_version: string;
}

export async function embedFace(fileUri: string): Promise<EmbedResponse> {
  const url = `${API_BASE_URL}/api/v1/embed`;
  const filename = fileUri.split("/").pop() ?? "face.jpg";
  const formData = new FormData();
  formData.append("file", {
    uri: fileUri,
    name: filename,
    type: "image/jpeg",
  } as unknown as Blob);

  const response = await fetch(url, { method: "POST", body: formData });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Embed failed (${response.status}): ${text}`);
  }
  return response.json();
}
