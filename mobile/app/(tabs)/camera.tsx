import { useRef, useState, useCallback } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/colors";
import { captureRef } from "@/utils/cameraCapture";

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

export default function CameraScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [photos, setPhotos] = useState<CapturedPhoto[]>([]);
  const [quality, setQuality] = useState<PhotoQuality>("good");
  const [isTakingPhoto, setIsTaking] = useState(false);
  const cameraRef = useRef<CameraView>(null);

  const { color: qualityColor, label: qualityLabel } = QUALITY_CONFIG[quality];

  function cycleQuality() {
    setQuality((prev) => {
      const idx = QUALITY_CYCLE.indexOf(prev);
      return QUALITY_CYCLE[(idx + 1) % QUALITY_CYCLE.length];
    });
  }

  async function handleCapture() {
    if (isTakingPhoto || !cameraRef.current) return;
    setIsTaking(true);
    try {
      const result = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      if (result) {
        setPhotos((prev) => [
          { id: Date.now().toString(), uri: result.uri },
          ...prev,
        ]);
      }
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

      {/* Status label */}
      <TouchableOpacity onPress={cycleQuality} activeOpacity={0.7}>
        <Text style={[styles.statusLabel, { color: qualityColor }]}>
          {qualityLabel}
        </Text>
      </TouchableOpacity>

      {/* Viewfinder */}
      <View
        style={[styles.viewfinderOuter, { borderColor: qualityColor + "66" }]}
      >
        <View style={styles.viewfinderInner}>
          <CameraView
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            facing="back"
            mode="picture"
          />
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
              <View key={photo.id} style={styles.thumbnailCard}>
                <Image
                  source={{ uri: photo.uri }}
                  style={styles.thumbnailImage}
                  resizeMode="cover"
                />
                <TouchableOpacity
                  style={styles.deleteIcon}
                  onPress={() => handleDeletePress(photo.id)}
                >
                  <Ionicons
                    name="close-circle"
                    size={20}
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
    fontSize: 14,
    fontWeight: "600",
    paddingVertical: 10,
  },
  viewfinderOuter: {
    marginHorizontal: 16,
    aspectRatio: 3 / 4,
    borderWidth: 4,
    borderRadius: 16,
    padding: 3,
  },
  viewfinderInner: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.primary,
    borderRadius: 12,
    overflow: "hidden",
  },
  thumbnailContainer: {
    height: 88,
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
  thumbnailCard: {
    width: 72,
    height: 72,
    borderRadius: 8,
    overflow: "visible",
  },
  thumbnailImage: {
    width: 72,
    height: 72,
    borderRadius: 8,
  },
  deleteIcon: {
    position: "absolute",
    top: -6,
    right: -6,
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
