import { useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { deletePhotoRef } from "@/utils/photoStore";
import { PhotoSwipeViewer } from "@/components/PhotoSwipeViewer";

interface Photo {
  id: string;
  uri: string;
}

export default function PhotoViewer() {
  const router = useRouter();
  const { photos: photosParam, index: indexParam } = useLocalSearchParams<{
    photos: string;
    index: string;
  }>();

  const [photos, setPhotos] = useState<Photo[]>(() => {
    try {
      return JSON.parse(photosParam) as Photo[];
    } catch {
      return [];
    }
  });

  const initialIndex = parseInt(indexParam ?? "0", 10);

  function handleDelete(id: string) {
    deletePhotoRef.current?.(id);
    const next = photos.filter((p) => p.id !== id);
    if (next.length === 0) {
      router.back();
      return;
    }
    setPhotos(next);
  }

  return (
    <PhotoSwipeViewer
      photos={photos}
      initialIndex={initialIndex}
      onClose={() => router.back()}
      onDelete={handleDelete}
      backgroundColor={Colors.white}
    />
  );
}
