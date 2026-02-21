import { useRef, useState } from "react";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
  View,
  Image,
  TouchableOpacity,
  StyleSheet,
  Alert,
  FlatList,
  Dimensions,
  Text,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { deletePhotoRef } from "@/utils/photoStore";

const { width } = Dimensions.get("window");

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
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList<Photo>>(null);

  function handleDelete() {
    const photo = photos[currentIndex];
    Alert.alert("Delete Photo", "Remove this photo from the session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deletePhotoRef.current?.(photo.id);
          const next = photos.filter((_, i) => i !== currentIndex);
          if (next.length === 0) {
            router.back();
            return;
          }
          setPhotos(next);
          setCurrentIndex((prev) => Math.min(prev, next.length - 1));
        },
      },
    ]);
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={photos}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        initialScrollIndex={initialIndex}
        getItemLayout={(_, index) => ({
          length: width,
          offset: width * index,
          index,
        })}
        onMomentumScrollEnd={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          setCurrentIndex(index);
        }}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <Image
            source={{ uri: item.uri }}
            style={styles.image}
            resizeMode="contain"
          />
        )}
      />

      <SafeAreaView style={styles.overlay} edges={["top"]}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.iconButton}
            onPress={() => router.back()}
          >
            <Ionicons name="chevron-back" size={28} color={Colors.white} />
          </TouchableOpacity>

          {photos.length > 1 && (
            <Text style={styles.counter}>
              {currentIndex + 1} / {photos.length}
            </Text>
          )}

          <TouchableOpacity style={styles.iconButton} onPress={handleDelete}>
            <Ionicons name="trash-outline" size={24} color={Colors.error} />
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#000",
  },
  image: {
    width,
    flex: 1,
  },
  overlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
  },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  iconButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    color: Colors.white,
    fontSize: 15,
    fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
});
