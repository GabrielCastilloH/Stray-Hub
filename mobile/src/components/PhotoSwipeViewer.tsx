import { useRef, useState } from "react";
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

const { width } = Dimensions.get("window");

interface Photo {
  id: string;
  uri: string;
}

interface PhotoSwipeViewerProps {
  photos: Photo[];
  initialIndex?: number;
  onClose: () => void;
  onDelete?: (id: string) => void;
  backgroundColor?: string;
}

export function PhotoSwipeViewer({
  photos: initialPhotos,
  initialIndex = 0,
  onClose,
  onDelete,
  backgroundColor = Colors.white,
}: PhotoSwipeViewerProps) {
  const [photos, setPhotos] = useState<Photo[]>(initialPhotos);
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const flatListRef = useRef<FlatList<Photo>>(null);

  function handleDeletePress() {
    const photo = photos[currentIndex];
    Alert.alert("Delete Photo", "Remove this photo from the session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          onDelete?.(photo.id);
          const next = photos.filter((p) => p.id !== photo.id);
          if (next.length === 0) {
            onClose();
            return;
          }
          setPhotos(next);
          setCurrentIndex((prev) => Math.min(prev, next.length - 1));
        },
      },
    ]);
  }

  return (
    <View style={[styles.container, { backgroundColor }]}>
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
        onScroll={(e) => {
          const index = Math.round(e.nativeEvent.contentOffset.x / width);
          if (index !== currentIndex) setCurrentIndex(index);
        }}
        scrollEventThrottle={16}
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
          <TouchableOpacity style={styles.iconButton} onPress={onClose}>
            <Ionicons name="chevron-back" size={28} color={Colors.textPrimary} />
          </TouchableOpacity>

          {photos.length > 1 && (
            <Text style={styles.counter}>
              {currentIndex + 1} / {photos.length}
            </Text>
          )}

          {onDelete ? (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={handleDeletePress}
            >
              <Ionicons name="trash-outline" size={24} color={Colors.error} />
            </TouchableOpacity>
          ) : (
            <View style={styles.iconButton} />
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
    backgroundColor: "rgba(0,0,0,0.08)",
    alignItems: "center",
    justifyContent: "center",
  },
  counter: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: "600",
    backgroundColor: "rgba(0,0,0,0.08)",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
  },
});
