import { useRef, useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  ActivityIndicator,
  Linking,
  Image,
  PanResponder,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { captureRef } from "@/utils/cameraCapture";
import { deletePhotoRef } from "@/utils/photoStore";

type PhotoQuality = "good" | "okay" | "poor";

interface CapturedPhoto {
  id: string;
  uri: string;
}

const QUALITY_CONFIG: Record<PhotoQuality, { color: string; label: string }> = {
  good: { color: Colors.accent, label: "Perfect! Great angle" },
  okay: { color: Colors.warning, label: "Slightly off angle" },
  poor: { color: Colors.error, label: "Too blurry or dark" },
};

const QUALITY_CYCLE: PhotoQuality[] = ["good", "okay", "poor"];

function getPinchDistance(touches: { pageX: number; pageY: number }[]) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [quality, setQuality] = useState<PhotoQuality>("good");
  const [isTakingPhoto, setIsTaking] = useState(false);
  const [zoom, setZoom] = useState(0);
  const zoomRef = useRef(0);
  const baseZoomRef = useRef(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const cameraRef = useRef<CameraView>(null);
  const router = useRouter();

  const pinchResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt) =>
        evt.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (evt) =>
        evt.nativeEvent.touches.length === 2,
      onPanResponderGrant: (evt) => {
        if (evt.nativeEvent.touches.length === 2) {
          pinchStartDistRef.current = getPinchDistance(
            evt.nativeEvent.touches as { pageX: number; pageY: number }[],
          );
          baseZoomRef.current = zoomRef.current;
        }
      },
      onPanResponderMove: (evt) => {
        const touches = evt.nativeEvent.touches;
        if (touches.length === 2 && pinchStartDistRef.current !== null) {
          const dist = getPinchDistance(
            touches as { pageX: number; pageY: number }[],
          );
          const delta = (dist - pinchStartDistRef.current) / 500;
          const newZoom = Math.min(1, Math.max(0, baseZoomRef.current + delta));
          zoomRef.current = newZoom;
          setZoom(newZoom);
        }
      },
      onPanResponderRelease: () => {
        pinchStartDistRef.current = null;
      },
      onPanResponderTerminate: () => {
        pinchStartDistRef.current = null;
      },
    }),
  ).current;

  const { color: qualityColor, label: qualityLabel } = QUALITY_CONFIG[quality];

  function cycleQuality() {
    setQuality((prev) => {
      const idx = QUALITY_CYCLE.indexOf(prev);
      return QUALITY_CYCLE[(idx + 1) % QUALITY_CYCLE.length];
    });
  }

  async function handleCapture() {
    if (isTakingPhoto) return;
    setIsTaking(true);
    try {
      let uri: string | null = null;
      if (cameraRef.current) {
        try {
          const result = await cameraRef.current.takePictureAsync({
            quality: 0.8,
          });
          uri = result?.uri ?? null;
        } catch {
          // Camera not available (e.g. simulator) — fall through to sample photo
        }
      }
      if (!uri) {
        // Sample test photo for UI testing
        uri = `https://picsum.photos/seed/${Date.now()}/400/400`;
      }
      setPhotos((prev) => [{ id: Date.now().toString(), uri }, ...prev]);
    } finally {
      setIsTaking(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      captureRef.current = handleCapture;
      return () => {
        captureRef.current = null;
      };
    }, [isTakingPhoto]),
  );

  // Keep deletePhotoRef alive even when camera loses focus (e.g. while photo-viewer is open)
  useEffect(() => {
    deletePhotoRef.current = (id: string) =>
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    return () => {
      deletePhotoRef.current = null;
    };
  }, []);

  function handlePhotoPress(photo: CapturedPhoto) {
    router.push({
      pathname: "/photo-viewer",
      params: { uri: photo.uri, id: photo.id },
    });
  }

  function handleDeletePress(id: string) {
    Alert.alert("Delete Photo", "Remove this photo from the session?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => setPhotos((prev) => prev.filter((p) => p.id !== id)),
      },
    ]);
  }

  if (!permission) {
    return (
      <SafeAreaView style={styles.centered}>
        <ActivityIndicator size="large" color={Colors.accent} />
      </SafeAreaView>
    );
  }

  if (!permission.granted) {
    return (
      <SafeAreaView style={styles.centered}>
        <Ionicons name="camera-outline" size={64} color={Colors.textDisabled} />
        <Text style={styles.permissionTitle}>Camera access needed</Text>
        <Text style={styles.permissionSub}>
          Shrub needs the camera to identify animals.
        </Text>
        {permission.canAskAgain ? (
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={requestPermission}
          >
            <Text style={styles.permissionButtonText}>Grant Access</Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={() => Linking.openSettings()}
          >
            <Text style={styles.permissionButtonText}>Open Settings</Text>
          </TouchableOpacity>
        )}
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require("../../assets/logo-big.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Camera section — centered vertically */}
      <View style={styles.cameraSection}>
        {/* Status label */}
        <TouchableOpacity onPress={cycleQuality} activeOpacity={0.7}>
          <Text style={[styles.statusLabel, { color: qualityColor }]}>
            {qualityLabel}
          </Text>
        </TouchableOpacity>

        {/* Viewfinder */}
        <View
          style={styles.viewfinderContainer}
          {...pinchResponder.panHandlers}
        >
          {/* Outer glow border — behind, extends slightly outside the inner frame */}
          <View
            style={[
              styles.viewfinderOuter,
              { borderColor: qualityColor + "66" },
            ]}
          />
          {/* Inner frame — on top, covers the inner edge of the outer border */}
          <View style={styles.viewfinderInner}>
            <CameraView
              ref={cameraRef}
              style={StyleSheet.absoluteFill}
              facing="back"
              mode="picture"
              zoom={zoom}
            />
            {zoom > 0.01 && (
              <View style={styles.zoomBadge}>
                <Text style={styles.zoomBadgeText}>
                  {(1 + zoom * 4).toFixed(1)}×
                </Text>
              </View>
            )}
          </View>
        </View>
      </View>

      {/* Thumbnail strip */}
      <View style={styles.thumbnailContainer}>
        {photos.length === 0 ? (
          <Text style={styles.thumbnailEmpty}>
            Captured photos will appear here
          </Text>
        ) : (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.thumbnailScroll}
          >
            {photos.map((photo) => (
              <View key={photo.id} style={styles.thumbnailWrapper}>
                <TouchableOpacity
                  style={styles.thumbnailCard}
                  onPress={() => handlePhotoPress(photo)}
                  activeOpacity={0.8}
                >
                  <Image
                    source={{ uri: photo.uri }}
                    style={styles.thumbnailImage}
                    resizeMode="cover"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.deleteIcon}
                  onPress={() => handleDeletePress(photo.id)}
                  hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                >
                  <View style={styles.deleteIconBg} />
                  <Ionicons
                    name="close-circle"
                    size={22}
                    color={Colors.error}
                  />
                </TouchableOpacity>
              </View>
            ))}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  centered: {
    flex: 1,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
    gap: 16,
    paddingHorizontal: 32,
  },
  header: {
    alignItems: "center",
    paddingVertical: 6,
  },
  logo: {
    height: 48,
    width: 180,
  },
  statusLabel: {
    textAlign: "center",
    fontSize: 24,
    fontWeight: "400",
    paddingTop: 10,
    paddingBottom: 24,
  },
  cameraSection: {
    flex: 1,
    justifyContent: "center",
  },
  viewfinderContainer: {
    marginHorizontal: 16,
    aspectRatio: 1,
  },
  viewfinderOuter: {
    position: "absolute",
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderWidth: 12,
    borderRadius: 18,
  },
  viewfinderInner: {
    flex: 1,
    borderWidth: 3,
    borderColor: Colors.primary,
    borderRadius: 12,
    overflow: "hidden",
  },
  thumbnailContainer: {
    height: 116,
    justifyContent: "center",
    marginTop: 12,
  },
  thumbnailScroll: {
    paddingHorizontal: 16,
    gap: 10,
    alignItems: "center",
  },
  thumbnailEmpty: {
    textAlign: "center",
    color: Colors.textDisabled,
    fontSize: 13,
  },
  thumbnailWrapper: {
    width: 100,
    height: 100,
    overflow: "visible",
  },
  thumbnailCard: {
    width: 100,
    height: 100,
    borderRadius: 10,
    overflow: "hidden",
  },
  thumbnailImage: {
    width: 100,
    height: 100,
  },
  deleteIcon: {
    position: "absolute",
    top: -8,
    right: -8,
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteIconBg: {
    position: "absolute",
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.white,
  },
  zoomBadge: {
    position: "absolute",
    bottom: 10,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  zoomBadgeText: {
    color: "#fff",
    fontSize: 13,
    fontWeight: "600",
  },
  permissionTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  permissionSub: {
    fontSize: 14,
    color: Colors.textSecondary,
    textAlign: "center",
  },
  permissionButton: {
    marginTop: 8,
    backgroundColor: Colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
  },
  permissionButtonText: {
    color: Colors.textOnDark,
    fontWeight: "700",
    fontSize: 15,
  },
});
