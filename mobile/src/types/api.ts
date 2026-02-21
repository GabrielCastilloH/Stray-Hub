export interface MatchCandidate {
  sighting_id: string;
  similarity: number;
  photo_signed_url: string | null;
}

export interface PipelineResponse {
  id: string;
  photo_storage_paths: string[];
  photo_resized_storage_paths: string[];
  photo_signed_urls: (string | null)[];
  location: { latitude: number; longitude: number };
  notes: string;
  disease_tags: string[];
  embedding: number[] | null;
  model_version: string | null;
  photos_embedded: number;
  embedding_size: number;
  status: "pending" | "processing" | "matched" | "no_match";
  match_candidates: MatchCandidate[];
  created_at: string;
  updated_at: string;
}
