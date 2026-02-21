import { useRef, useState, useEffect } from "react";
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
  TextInput,
  KeyboardAvoidingView,
  Platform,
  Dimensions,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { CameraView, useCameraPermissions } from "expo-camera";
import { StatusBar } from "expo-status-bar";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { Colors } from "@/constants/colors";
import { analyzePhoto, type PhotoQuality } from "@/utils/photoAnalysis";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const VIEWFINDER_SIZE = Math.floor(SCREEN_WIDTH * 0.72);
const SLOT_IMAGE_SIZE = Math.floor((SCREEN_WIDTH - 32 - 4 * 8) / 5);

const PHOTO_ANGLES = ["Left Side", "Right Side", "Front", "Back", "Head"] as const;

// Common conditions vets can quickly tap to add — ensures consistent backend data
const COMMON_CONDITIONS = [
  "Rabies",
  "Distemper",
  "Parvovirus",
  "Heartworm",
  "Ehrlichia",
  "Ringworm",
  "Mange",
  "Leptospirosis",
  "Kennel Cough",
  "Giardia",
  "Intestinal Parasites",
  "Fleas / Ticks",
  "Skin Infection",
  "Malnutrition",
  "Eye Infection",
  "Ear Infection",
  "Fracture / Injury",
];

const QUALITY_COLORS: Record<PhotoQuality, string> = {
  good: Colors.accent,
  okay: Colors.warning,
  poor: Colors.error,
};

interface DiseaseEntry {
  id: string;
  name: string;
  status: string;
  isCustom: boolean;
}

function getPinchDistance(touches: { pageX: number; pageY: number }[]) {
  const dx = touches[0].pageX - touches[1].pageX;
  const dy = touches[0].pageY - touches[1].pageY;
  return Math.sqrt(dx * dx + dy * dy);
}

function FormSection({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.formSection}>
      <View style={styles.formSectionHeader}>
        <Ionicons name={icon} size={14} color={Colors.textSecondary} />
        <Text style={styles.formSectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

export default function VetIntakeScreen() {
  const [permission, requestPermission] = useCameraPermissions();
  const [slotPhotos, setSlotPhotos] = useState<(string | null)[]>([
    null, null, null, null, null,
  ]);
  const [activeSlot, setActiveSlot] = useState(0);
  const [quality, setQuality] = useState<PhotoQuality | null>(null);
  const [isTakingPhoto, setIsTaking] = useState(false);
  const [zoom, setZoom] = useState(0);

  // Form fields
  const [foundLocation, setFoundLocation] = useState("");
  const [clinicName, setClinicName] = useState("");
  const [cnvr, setCnvr] = useState({
    neutered: false,
    vaccinated: false,
  });
  const [sex, setSex] = useState("Unknown");
  const [ageEstimate, setAgeEstimate] = useState("");
  const [breed, setBreed] = useState("");
  const [diseases, setDiseases] = useState<DiseaseEntry[]>([]);
  const [notes, setNotes] = useState("");

  const cameraRef = useRef<CameraView>(null);
  const isTakingPhotoRef = useRef(false);
  const isLiveAnalyzingRef = useRef(false);
  const zoomRef = useRef(0);
  const baseZoomRef = useRef(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const router = useRouter();

  const takenCount = slotPhotos.filter(Boolean).length;
  const allTaken = takenCount === 5;
  const isRetaking = slotPhotos[activeSlot] !== null;
  const qualityColor = quality != null ? QUALITY_COLORS[quality] : Colors.primary;

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
        const t = evt.nativeEvent.touches;
        if (t.length === 2 && pinchStartDistRef.current !== null) {
          const dist = getPinchDistance(
            t as { pageX: number; pageY: number }[],
          );
          const delta = (dist - pinchStartDistRef.current) / 500;
          const nz = Math.min(1, Math.max(0, baseZoomRef.current + delta));
          zoomRef.current = nz;
          setZoom(nz);
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

  useEffect(() => {
    async function run() {
      if (
        isLiveAnalyzingRef.current ||
        isTakingPhotoRef.current ||
        !cameraRef.current
      )
        return;
      isLiveAnalyzingRef.current = true;
      try {
        const snap = await cameraRef.current.takePictureAsync({ quality: 0.1 });
        if (snap?.uri) {
          const { quality: q } = await analyzePhoto(snap.uri);
          setQuality(q);
        }
      } catch {
        // ignore
      } finally {
        isLiveAnalyzingRef.current = false;
      }
    }
    run();
    const id = setInterval(run, 1500);
    return () => clearInterval(id);
  }, []);

  async function handleCapture() {
    if (isTakingPhotoRef.current) return;
    isTakingPhotoRef.current = true;
    setIsTaking(true);
    try {
      while (isLiveAnalyzingRef.current) {
        await new Promise<void>((r) => setTimeout(r, 50));
      }
      if (!cameraRef.current) return;
      const result = await cameraRef.current.takePictureAsync({ quality: 0.85 });
      if (!result?.uri) return;

      const current = activeSlot;
      const updated = [...slotPhotos];
      updated[current] = result.uri;
      setSlotPhotos(updated);

      // Only advance to the next empty slot if this was a new capture, not a retake
      if (!isRetaking) {
        let next = -1;
        for (let i = current + 1; i < 5; i++) {
          if (!updated[i]) { next = i; break; }
        }
        if (next === -1) {
          for (let i = 0; i < current; i++) {
            if (!updated[i]) { next = i; break; }
          }
        }
        if (next !== -1) setActiveSlot(next);
      }
    } finally {
      setIsTaking(false);
      isTakingPhotoRef.current = false;
    }
  }

  // Toggle a preset condition: add if absent, remove if already present
  function togglePresetCondition(name: string) {
    setDiseases((prev) => {
      const exists = prev.find((d) => d.name === name && !d.isCustom);
      if (exists) {
        return prev.filter((d) => d.id !== exists.id);
      }
      return [
        ...prev,
        { id: Date.now().toString(), name, status: "Active", isCustom: false },
      ];
    });
  }

  function addCustomCondition() {
    setDiseases((prev) => [
      ...prev,
      { id: Date.now().toString(), name: "", status: "Active", isCustom: true },
    ]);
  }

  function handleSubmit() {
    if (takenCount < 5) {
      Alert.alert(
        "Missing Photos",
        `Please capture all 5 photos before submitting. (${takenCount}/5 taken)`,
      );
      return;
    }
    Alert.alert(
      "Submit Record",
      "Upload this animal record to the Stray Hub database?",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Submit", onPress: () => router.back() },
      ],
    );
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
        <Text style={styles.permTitle}>Camera access needed</Text>
        <TouchableOpacity
          style={styles.permBtn}
          onPress={
            permission.canAskAgain
              ? requestPermission
              : () => Linking.openSettings()
          }
        >
          <Text style={styles.permBtnText}>
            {permission.canAskAgain ? "Grant Access" : "Open Settings"}
          </Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  const guideColor = isRetaking ? Colors.warning : qualityColor;
  const guideText = `${isRetaking ? "Retake" : "Capture"}: ${PHOTO_ANGLES[activeSlot]}`;

  return (
    <SafeAreaView style={styles.root} edges={["top", "bottom"]}>
      <StatusBar style="dark" />

      {/* ── Header ── */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={24} color={Colors.textPrimary} />
        </TouchableOpacity>
        <View style={styles.headerCenter}>
          <Text style={styles.headerTitle}>Vet Intake</Text>
        </View>
        <View style={styles.progressChip}>
          <Text style={styles.progressChipText}>{takenCount}/5</Text>
        </View>
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── Photo Slots Strip ── */}
          <View style={styles.slotsStrip}>
            {PHOTO_ANGLES.map((label, i) => {
              const isActive = i === activeSlot;
              const photo = slotPhotos[i];
              return (
                <TouchableOpacity
                  key={label}
                  style={[styles.slotOuter, isActive && styles.slotOuterActive]}
                  onPress={() => setActiveSlot(i)}
                  activeOpacity={0.75}
                >
                  {/* Square image / placeholder box */}
                  <View
                    style={[
                      styles.slotImageBox,
                      isActive && styles.slotImageBoxActive,
                      photo != null && styles.slotImageBoxFilled,
                    ]}
                  >
                    {photo ? (
                      <>
                        <Image
                          source={{ uri: photo }}
                          style={StyleSheet.absoluteFill}
                          resizeMode="cover"
                        />
                        {/* Retake hint overlay when this filled slot is active */}
                        {isActive && (
                          <View style={styles.slotRetakeOverlay}>
                            <Ionicons name="camera" size={14} color="#fff" />
                          </View>
                        )}
                        {!isActive && (
                          <View style={styles.slotCheckBadge}>
                            <Ionicons
                              name="checkmark-circle"
                              size={15}
                              color={Colors.accent}
                            />
                          </View>
                        )}
                      </>
                    ) : (
                      <Ionicons
                        name="camera-outline"
                        size={22}
                        color={isActive ? Colors.accent : Colors.textDisabled}
                      />
                    )}
                  </View>
                  {/* Label below the image box — larger, centered, wraps */}
                  <Text
                    style={[
                      styles.slotLabel,
                      isActive && styles.slotLabelActive,
                      photo != null && !isActive && styles.slotLabelFilled,
                    ]}
                  >
                    {label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Camera Section ── */}
          <View style={styles.cameraSection}>
            <Text style={[styles.guideLabel, { color: guideColor }]}>
              {guideText}
            </Text>

            <View
              style={styles.viewfinderWrapper}
              {...pinchResponder.panHandlers}
            >
              <View
                style={[
                  styles.viewfinderOuter,
                  { borderColor: guideColor + "55" },
                ]}
              />
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
                    <Text style={styles.zoomText}>
                      {(1 + zoom * 4).toFixed(1)}×
                    </Text>
                  </View>
                )}
              </View>
            </View>

            <TouchableOpacity
              style={[
                styles.captureBtn,
                isRetaking && styles.captureBtnRetake,
              ]}
              onPress={handleCapture}
              activeOpacity={0.85}
              disabled={isTakingPhoto}
            >
              <Ionicons
                name={isRetaking ? "camera-reverse-outline" : "camera"}
                size={20}
                color={Colors.textOnDark}
              />
              <Text style={styles.captureBtnText}>{guideText}</Text>
            </TouchableOpacity>

            {allTaken && !isRetaking && (
              <Text style={styles.scrollHint}>
                All photos captured — scroll down to fill in details
              </Text>
            )}
          </View>

          {/* ── Section Divider ── */}
          <View style={styles.divider}>
            <View style={styles.dividerLine} />
            <Text style={styles.dividerText}>Animal Information</Text>
            <View style={styles.dividerLine} />
          </View>

          {/* ── CNVR Status ── */}
          <FormSection icon="shield-checkmark-outline" title="CNVR Status">
            <View style={styles.cnvrRow}>
              {(
                ["neutered", "vaccinated"] as const
              ).map((key) => (
                <TouchableOpacity
                  key={key}
                  style={[styles.cnvrChip, cnvr[key] && styles.cnvrChipActive]}
                  onPress={() =>
                    setCnvr((p) => ({ ...p, [key]: !p[key] }))
                  }
                  activeOpacity={0.75}
                >
                  {cnvr[key] && (
                    <Ionicons
                      name="checkmark"
                      size={11}
                      color={Colors.accent}
                      style={{ marginRight: 3 }}
                    />
                  )}
                  <Text
                    style={[
                      styles.cnvrChipText,
                      cnvr[key] && styles.cnvrChipTextActive,
                    ]}
                  >
                    {key.charAt(0).toUpperCase() + key.slice(1)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </FormSection>

          {/* ── Found Location ── */}
          <FormSection icon="location-outline" title="Found Location">
            <TextInput
              style={styles.input}
              placeholder="Street address or landmark"
              placeholderTextColor={Colors.textDisabled}
              value={foundLocation}
              onChangeText={setFoundLocation}
            />
          </FormSection>

          {/* ── Clinic / Organization ── */}
          <FormSection icon="medical-outline" title="Clinic / Organization">
            <TextInput
              style={styles.input}
              placeholder="Where was this animal processed?"
              placeholderTextColor={Colors.textDisabled}
              value={clinicName}
              onChangeText={setClinicName}
            />
          </FormSection>

          {/* ── Sex ── */}
          <FormSection icon="male-female-outline" title="Sex">
            <View style={styles.segmentedRow}>
              {["Male", "Female", "Unknown"].map((opt) => (
                <TouchableOpacity
                  key={opt}
                  style={[
                    styles.segmentBtn,
                    sex === opt && styles.segmentBtnActive,
                  ]}
                  onPress={() => setSex(opt)}
                  activeOpacity={0.75}
                >
                  <Text
                    style={[
                      styles.segmentText,
                      sex === opt && styles.segmentTextActive,
                    ]}
                  >
                    {opt}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </FormSection>

          {/* ── Estimated Age ── */}
          <FormSection icon="calendar-outline" title="Estimated Age">
            <TextInput
              style={styles.input}
              placeholder="e.g. 2 years, 6 months"
              placeholderTextColor={Colors.textDisabled}
              value={ageEstimate}
              onChangeText={setAgeEstimate}
            />
          </FormSection>

          {/* ── Breed / Description ── */}
          <FormSection icon="paw-outline" title="Breed / Description">
            <TextInput
              style={styles.input}
              placeholder="e.g. Mixed breed, medium size, tan coat"
              placeholderTextColor={Colors.textDisabled}
              value={breed}
              onChangeText={setBreed}
            />
          </FormSection>

          {/* ── Health Findings ── */}
          <FormSection icon="flask-outline" title="Health Findings">
            {/* Common condition preset chips */}
            <Text style={styles.presetsLabel}>Common conditions</Text>
            <View style={styles.presetsGrid}>
              {COMMON_CONDITIONS.map((name) => {
                const added = diseases.some(
                  (d) => d.name === name && !d.isCustom,
                );
                return (
                  <TouchableOpacity
                    key={name}
                    style={[
                      styles.presetChip,
                      added && styles.presetChipAdded,
                    ]}
                    onPress={() => togglePresetCondition(name)}
                    activeOpacity={0.75}
                  >
                    {added && (
                      <Ionicons
                        name="checkmark"
                        size={11}
                        color={Colors.accent}
                        style={{ marginRight: 3 }}
                      />
                    )}
                    <Text
                      style={[
                        styles.presetChipText,
                        added && styles.presetChipTextAdded,
                      ]}
                    >
                      {name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Added entries list (presets + custom) */}
            {diseases.length > 0 && (
              <View style={styles.diseaseList}>
                <Text style={styles.presetsLabel}>Added findings</Text>
                {diseases.map((d) => (
                  <View key={d.id} style={styles.diseaseEntry}>
                    <View style={styles.diseaseEntryTop}>
                      {d.isCustom ? (
                        <TextInput
                          style={[styles.input, styles.diseaseInput]}
                          placeholder="Condition name"
                          placeholderTextColor={Colors.textDisabled}
                          value={d.name}
                          onChangeText={(v) =>
                            setDiseases((p) =>
                              p.map((x) =>
                                x.id === d.id ? { ...x, name: v } : x,
                              ),
                            )
                          }
                        />
                      ) : (
                        <View style={styles.diseaseName}>
                          <Text style={styles.diseaseNameText}>{d.name}</Text>
                        </View>
                      )}
                      <TouchableOpacity
                        style={styles.removeBtn}
                        onPress={() =>
                          setDiseases((p) => p.filter((x) => x.id !== d.id))
                        }
                        hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                      >
                        <Ionicons
                          name="close-circle"
                          size={20}
                          color={Colors.error}
                        />
                      </TouchableOpacity>
                    </View>
                    <View style={styles.diseaseStatusRow}>
                      {["Active", "Treated", "Recovered", "Cleared"].map(
                        (s) => (
                          <TouchableOpacity
                            key={s}
                            style={[
                              styles.statusChip,
                              d.status === s && styles.statusChipActive,
                            ]}
                            onPress={() =>
                              setDiseases((p) =>
                                p.map((x) =>
                                  x.id === d.id ? { ...x, status: s } : x,
                                ),
                              )
                            }
                          >
                            <Text
                              style={[
                                styles.statusChipText,
                                d.status === s && styles.statusChipTextActive,
                              ]}
                            >
                              {s}
                            </Text>
                          </TouchableOpacity>
                        ),
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* Add custom finding */}
            <TouchableOpacity
              style={styles.addBtn}
              onPress={addCustomCondition}
              activeOpacity={0.75}
            >
              <Ionicons
                name="create-outline"
                size={18}
                color={Colors.secondary}
              />
              <Text style={styles.addBtnText}>Add Custom Finding</Text>
            </TouchableOpacity>
          </FormSection>

          {/* ── Notes ── */}
          <FormSection icon="document-text-outline" title="Notes">
            <TextInput
              style={[styles.input, styles.inputMultiline]}
              placeholder="Additional observations or context..."
              placeholderTextColor={Colors.textDisabled}
              value={notes}
              onChangeText={setNotes}
              multiline
              numberOfLines={3}
              textAlignVertical="top"
            />
          </FormSection>

          {/* ── Submit ── */}
          <TouchableOpacity
            style={[
              styles.submitBtn,
              takenCount < 5 && styles.submitBtnDisabled,
            ]}
            onPress={handleSubmit}
            activeOpacity={0.85}
          >
            <Ionicons
              name="cloud-upload-outline"
              size={20}
              color={
                takenCount === 5 ? Colors.textOnDark : Colors.textDisabled
              }
            />
            <Text
              style={[
                styles.submitBtnText,
                takenCount < 5 && styles.submitBtnTextDisabled,
              ]}
            >
              {takenCount < 5
                ? `${5 - takenCount} Photo${5 - takenCount !== 1 ? "s" : ""} Remaining`
                : "Submit Record"}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
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

  // ── Header ──
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  backBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  headerCenter: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  progressChip: {
    backgroundColor: Colors.accentSubtle,
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 10,
  },
  progressChipText: {
    fontSize: 13,
    fontWeight: "700",
    color: Colors.accent,
  },

  // ── Scroll ──
  scrollContent: {
    paddingBottom: 40,
  },

  // ── Photo Slots ──
  slotsStrip: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
    gap: 8,
    alignItems: "flex-start",
  },
  slotOuter: {
    width: SLOT_IMAGE_SIZE,
    alignItems: "center",
    gap: 5,
  },
  slotOuterActive: {
    // intentionally empty — active state is shown on the image box
  },
  slotImageBox: {
    width: SLOT_IMAGE_SIZE,
    height: SLOT_IMAGE_SIZE,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  slotImageBoxActive: {
    borderColor: Colors.accent,
    borderWidth: 2,
    backgroundColor: Colors.accentSubtle,
  },
  slotImageBoxFilled: {
    borderColor: Colors.accent + "88",
  },
  slotCheckBadge: {
    position: "absolute",
    top: 3,
    right: 3,
    backgroundColor: Colors.white,
    borderRadius: 8,
  },
  slotRetakeOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.45)",
    alignItems: "center",
    paddingVertical: 4,
  },
  slotLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 14,
  },
  slotLabelActive: {
    color: Colors.accent,
  },
  slotLabelFilled: {
    color: Colors.textSecondary,
  },

  // ── Camera ──
  cameraSection: {
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: 8,
  },
  guideLabel: {
    fontSize: 16,
    fontWeight: "600",
    marginBottom: 10,
  },
  viewfinderWrapper: {
    width: VIEWFINDER_SIZE,
    height: VIEWFINDER_SIZE,
    marginBottom: 14,
  },
  viewfinderOuter: {
    position: "absolute",
    top: -5,
    left: -5,
    right: -5,
    bottom: -5,
    borderWidth: 10,
    borderRadius: 16,
  },
  viewfinderInner: {
    flex: 1,
    borderWidth: 2.5,
    borderColor: Colors.primary,
    borderRadius: 12,
    overflow: "hidden",
  },
  zoomBadge: {
    position: "absolute",
    bottom: 8,
    alignSelf: "center",
    backgroundColor: "rgba(0,0,0,0.45)",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },
  zoomText: {
    color: "#fff",
    fontSize: 12,
    fontWeight: "600",
  },
  captureBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 12,
    alignSelf: "stretch",
  },
  captureBtnRetake: {
    backgroundColor: Colors.primary,
  },
  captureBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.textOnDark,
  },
  scrollHint: {
    marginTop: 8,
    fontSize: 12,
    color: Colors.textDisabled,
    textAlign: "center",
  },

  // ── Divider ──
  divider: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 16,
    gap: 10,
  },
  dividerLine: {
    flex: 1,
    height: StyleSheet.hairlineWidth,
    backgroundColor: Colors.border,
  },
  dividerText: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  // ── Form ──
  formSection: {
    marginHorizontal: 16,
    marginBottom: 12,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  formSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 10,
  },
  formSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: Colors.textPrimary,
    backgroundColor: Colors.background,
  },
  inputMultiline: {
    height: 80,
    paddingTop: 10,
  },

  // ── CNVR ──
  cnvrRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  cnvrChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  cnvrChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  cnvrChipText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  cnvrChipTextActive: {
    color: Colors.accent,
  },

  // ── Segmented ──
  segmentedRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    alignItems: "center",
    backgroundColor: Colors.background,
  },
  segmentBtnActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.accent,
  },

  // ── Health Findings ──
  presetsLabel: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textDisabled,
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  },
  presetsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 14,
  },
  presetChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  presetChipAdded: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  presetChipText: {
    fontSize: 12,
    fontWeight: "500",
    color: Colors.textSecondary,
  },
  presetChipTextAdded: {
    color: Colors.accent,
    fontWeight: "600",
  },
  diseaseList: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    paddingTop: 12,
    marginBottom: 4,
  },
  diseaseEntry: {
    marginBottom: 12,
    gap: 6,
  },
  diseaseEntryTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  diseaseName: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.surfaceMuted,
  },
  diseaseNameText: {
    fontSize: 14,
    color: Colors.textPrimary,
    fontWeight: "500",
  },
  diseaseInput: {
    flex: 1,
  },
  removeBtn: {
    padding: 2,
  },
  diseaseStatusRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
  },
  statusChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  statusChipActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  statusChipText: {
    fontSize: 11,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  statusChipTextActive: {
    color: Colors.accent,
  },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  addBtnText: {
    fontSize: 14,
    color: Colors.secondary,
    fontWeight: "600",
  },

  // ── Submit ──
  submitBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 8,
    paddingVertical: 15,
    borderRadius: 12,
    backgroundColor: Colors.accent,
  },
  submitBtnDisabled: {
    backgroundColor: Colors.surfaceMuted,
  },
  submitBtnText: {
    color: Colors.textOnDark,
    fontSize: 16,
    fontWeight: "700",
  },
  submitBtnTextDisabled: {
    color: Colors.textDisabled,
  },

  // ── Permissions ──
  permTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
    textAlign: "center",
  },
  permBtn: {
    backgroundColor: Colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 8,
  },
  permBtnText: {
    color: Colors.textOnDark,
    fontWeight: "700",
    fontSize: 15,
  },
});
