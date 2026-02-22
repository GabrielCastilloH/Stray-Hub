export interface ProfileMatchCandidate {
  profile_id: string;
  name: string;
  similarity: number;
  photo_signed_url: string | null; // Direct Storage URL (legacy field name)
}

export interface SearchResponse {
  photos_processed: number;
  embedding_size: number;
  match_candidates: ProfileMatchCandidate[];
  location: { latitude: number; longitude: number };
}

export interface SightingEntry {
  timestamp: string;
  location: { latitude: number; longitude: number };
}

export interface PhotoMeta {
  photo_id: string;
  storage_path: string;
  signed_url?: string | null; // Deprecated
  download_url?: string; // Direct Storage URL
  uploaded_at: string;
  angle?: string | null;
}

export interface FirestorePhoto {
  photo_id: string;
  storage_path: string;
  download_url: string;
  uploaded_at: string;
  angle?: string | null;
}

export interface FirestoreProfile {
  id: string;
  name: string;
  species: string;
  sex: string;
  [key: string]: unknown;
}

export interface ProfileResponse {
  id: string;
  name: string;
  species: string;
  sex: string;
  breed: string;
  color_description: string;
  distinguishing_features: string;
  estimated_age_months: number | null;
  location_found: { latitude: number; longitude: number } | null;
  notes: string;
  photo_count: number;
  photos: PhotoMeta[];
  created_at: string;
  updated_at: string;
  embedding?: number[] | null;
  model_version?: string | null;
  sightings?: SightingEntry[];
  last_seen_location?: { latitude: number; longitude: number } | null;
  last_seen_at?: string | null;
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
  profile_number?: number | null;
}
