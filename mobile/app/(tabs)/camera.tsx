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
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { captureRef } from "@/utils/cameraCapture";
import { deletePhotoRef } from "@/utils/photoStore";
import { analyzePhoto, type PhotoQuality } from "@/utils/photoAnalysis";

interface CapturedPhoto {
  id: string;
  uri: string;
}

const QUALITY_COLORS: Record<PhotoQuality, string> = {
  good: Colors.accent,
  okay: Colors.warning,
  poor: Colors.error,
};

const DEFAULT_FEEDBACK = "Center the animal and shoot";

function getPinchDistance(touches: { pageX: number; pageY: number }[]) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [quality, setQuality] = useState<PhotoQuality | null>(null);
  const [feedback, setFeedback] = useState(DEFAULT_FEEDBACK);
  const [isTakingPhoto, setIsTaking] = useState(false);
  const [zoom, setZoom] = useState(0);
  const zoomRef = useRef(0);
  const baseZoomRef = useRef(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const cameraRef = useRef<CameraView>(null);
  // Refs so the live-analysis closure always sees the latest value without re-creating the interval
  const isTakingPhotoRef = useRef(false);
  const isLiveAnalyzingRef = useRef(false);
  const router = useRouter();

  const qualityColor =
    quality !== null ? QUALITY_COLORS[quality] : Colors.primary;

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

  async function handleCapture() {
    // Use ref for the guard — state updates are async but the ref is immediate,
    // preventing double-fires from the stale closure captured by useFocusEffect.
    if (isTakingPhotoRef.current) return;
    isTakingPhotoRef.current = true;
    setIsTaking(true);
    try {
      // Wait for any in-flight live snapshot to finish so the camera is free.
      // Without this, both calls race on takePictureAsync; the capture throws,
      // the inner catch fires, uri stays null, and the picsum fallback runs.
      while (isLiveAnalyzingRef.current) {
        await new Promise<void>((r) => setTimeout(r, 50));
      }
      if (!cameraRef.current) return;
      const result = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (!result?.uri) return;
      setPhotos((prev) => [{ id: Date.now().toString(), uri: result.uri }, ...prev]);
    } finally {
      setIsTaking(false);
      isTakingPhotoRef.current = false;
    }
  }

  useFocusEffect(
    useCallback(() => {
      captureRef.current = handleCapture;

      // Live frame analysis: take a silent low-quality snapshot every second,
      // analyze it, and update the feedback label — without adding to the photo strip.
      async function runLiveAnalysis() {
        if (isLiveAnalyzingRef.current || isTakingPhotoRef.current || !cameraRef.current) return;
        isLiveAnalyzingRef.current = true;
        try {
          const snap = await cameraRef.current.takePictureAsync({ quality: 0.1 });
          if (snap?.uri) {
            const analysis = await analyzePhoto(snap.uri);
            setQuality(analysis.quality);
            setFeedback(analysis.feedback);
          }
        } catch {
          // Ignore errors (e.g. camera busy, simulator)
        } finally {
          isLiveAnalyzingRef.current = false;
        }
      }

      runLiveAnalysis(); // run immediately on focus
      const id = setInterval(runLiveAnalysis, 1000);

      return () => {
        captureRef.current = null;
        clearInterval(id);
      };
    }, []),
  );

  // Keep deletePhotoRef alive even when camera loses focus (e.g. while photo-viewer is open)
  useEffect(() => {
    deletePhotoRef.current = (id: string) =>
      setPhotos((prev) => prev.filter((p) => p.id !== id));
    return () => {
      deletePhotoRef.current = null;
    };
  }, []);

  function handlePhotoPress(index: number) {
    router.push({
      pathname: "/photo-viewer",
      params: {
        photos: JSON.stringify(photos),
        index: index.toString(),
      },
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
          Stray Hub needs the camera to identify animals.
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

  function handleUpload() {
    Alert.alert(
      "Upload Photos",
      `Upload ${photos.length} photo${photos.length === 1 ? "" : "s"} for matching?`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Upload",
          onPress: () => {
            // TODO: call upload Cloud Function
          },
        },
      ],
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom"]}>
      <StatusBar style="dark" />
      {/* Header */}
      <View style={styles.header}>
        <Image
          source={require("../../assets/logo-long.png")}
          style={styles.logo}
          resizeMode="contain"
        />
      </View>

      {/* Camera section — centered vertically */}
      <View style={styles.cameraSection}>
        {/* Status label */}
        <View style={styles.statusLabelContainer}>
          <Text
            style={[styles.statusLabel, { color: qualityColor }]}
            numberOfLines={1}
            adjustsFontSizeToFit
          >
            {feedback}
          </Text>
        </View>

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
            {photos.map((photo, index) => (
              <View key={photo.id} style={styles.thumbnailWrapper}>
                <TouchableOpacity
                  style={styles.thumbnailCard}
                  onPress={() => handlePhotoPress(index)}
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

      {/* Upload button — always visible, active only with 2+ photos */}
      <TouchableOpacity
        style={[styles.uploadButton, photos.length < 2 && styles.uploadButtonDisabled]}
        onPress={handleUpload}
        activeOpacity={photos.length >= 2 ? 0.85 : 1}
        disabled={photos.length < 2}
      >
        <Ionicons
          name="cloud-upload-outline"
          size={20}
          color={photos.length >= 2 ? Colors.textOnDark : Colors.textDisabled}
        />
        <Text style={[styles.uploadButtonText, photos.length < 2 && styles.uploadButtonTextDisabled]}>
          {photos.length >= 2
            ? `Upload ${photos.length} Photos`
            : "Requires 2 Images"}
        </Text>
      </TouchableOpacity>
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
  statusLabelContainer: {
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 24,
  },
  statusLabel: {
    textAlign: "center",
    fontSize: 18,
    fontWeight: "400",
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
  uploadButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 10,
    marginBottom: 4,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent,
  },
  uploadButtonDisabled: {
    backgroundColor: Colors.surfaceMuted,
  },
  uploadButtonText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: "700",
  },
  uploadButtonTextDisabled: {
    color: Colors.textDisabled,
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
