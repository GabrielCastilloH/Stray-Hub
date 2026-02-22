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
