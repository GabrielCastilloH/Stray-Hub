import React, { useRef, useState, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
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
import * as Location from "expo-location";
import * as DocumentPicker from "expo-document-picker";
import { Colors } from "@/constants/colors";
import { analyzePhoto, type PhotoQuality } from "@/utils/photoAnalysis";

const { width: SCREEN_WIDTH } = Dimensions.get("window");
const VIEWFINDER_SIZE = Math.floor(SCREEN_WIDTH * 0.72);
const SLOT_IMAGE_SIZE = Math.floor((SCREEN_WIDTH - 32 - 4 * 8) / 5);

const PHOTO_ANGLES = ["Left Side", "Right Side", "Front", "Back", "Face"] as const;

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
  optional,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  optional?: boolean;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.formSection}>
      <View style={styles.formSectionHeader}>
        <Ionicons name={icon} size={14} color={Colors.textSecondary} />
        <Text style={styles.formSectionTitle}>{title}</Text>
        {optional && <Text style={styles.optionalLabel}>Optional</Text>}
      </View>
      {children}
    </View>
  );
}

function StepIndicator({ current }: { current: number }) {
  const steps = ["Snap", "Identity", "Health"];
  return (
    <View style={styles.stepIndicator}>
      {steps.map((label, i) => (
        <React.Fragment key={i}>
          <View style={styles.stepItem}>
            <View
              style={[
                styles.stepDot,
                i <= current && styles.stepDotActive,
              ]}
            >
              {i < current ? (
                <Ionicons name="checkmark" size={12} color="#fff" />
              ) : (
                <Text style={[styles.stepNumber, i <= current && styles.stepNumberActive]}>
                  {i + 1}
                </Text>
              )}
            </View>
            <Text style={[styles.stepLabel, i <= current && styles.stepLabelActive]}>
              {label}
            </Text>
          </View>
          {i < 2 && (
            <View style={[styles.stepConnector, i < current && styles.stepConnectorDone]} />
          )}
        </React.Fragment>
      ))}
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

  // Stepper
  const [currentStep, setCurrentStep] = useState(0);

  // Identity
  const [sex, setSex] = useState("Unknown");
  const [ageEstimate, setAgeEstimate] = useState<"Puppy" | "<1 Year" | "1-3 Years" | "3+ Years" | "">("");
  const [primaryColor, setPrimaryColor] = useState("");

  // Physical tagging
  const [microchipId, setMicrochipId] = useState("");
  const [collarTagId, setCollarTagId] = useState("");

  // Spay/Neuter
  const [neuterStatus, setNeuterStatus] = useState<"Intact" | "Neutered/Spayed" | "Unknown">("Unknown");
  const [surgeryDate, setSurgeryDate] = useState("");

  // Rabies vaccination
  const [rabiesStatus, setRabiesStatus] = useState<"Administered Today" | "Previously Vaccinated" | "Unvaccinated" | "">("");
  const [rabiesDateAdmin, setRabiesDateAdmin] = useState("");
  const [rabiesExpiry, setRabiesExpiry] = useState("");
  const [rabiesBatch, setRabiesBatch] = useState("");

  // DHPP
  const [dhppStatus, setDhppStatus] = useState<"Administered" | "Previously" | "Not Given" | "">("");
  const [dhppDate, setDhppDate] = useState("");

  // Step 3
  const [intakeLocation, setIntakeLocation] = useState("");
  const [locationLoading, setLocationLoading] = useState(false);
  const [diseases, setDiseases] = useState<DiseaseEntry[]>([]);
  const [biteRisk, setBiteRisk] = useState<"Safe" | "Caution" | "Aggressive" | "">("");
  const [attachedDocs, setAttachedDocs] = useState<{ name: string; uri: string; mimeType: string }[]>([]);
  const [clinicName, setClinicName] = useState("");
  const [releaseLocation, setReleaseLocation] = useState("");
  const [notes, setNotes] = useState("");

  const cameraRef = useRef<CameraView>(null);
  const isTakingPhotoRef = useRef(false);
  const isLiveAnalyzingRef = useRef(false);
  const zoomRef = useRef(0);
  const baseZoomRef = useRef(0);
  const pinchStartDistRef = useRef<number | null>(null);
  const router = useRouter();

  const takenCount = slotPhotos.filter(Boolean).length;
  const isRetaking = slotPhotos[activeSlot] !== null;
  const qualityColor = quality != null ? QUALITY_COLORS[quality] : Colors.primary;

  // Validation
  const canAdvanceStep1 = slotPhotos.every((p) => p !== null);
  const canAdvanceStep2 =
    sex !== "" && ageEstimate !== "" && rabiesStatus !== "";
  const canSubmit =
    intakeLocation.trim() !== "" && clinicName.trim() !== "" && biteRisk !== "";

  const isNextDisabled =
    currentStep === 0
      ? !canAdvanceStep1
      : currentStep === 1
      ? !canAdvanceStep2
      : !canSubmit;

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
    if (currentStep !== 0) return;

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
  }, [currentStep]);

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

  async function fetchGPSLocation() {
    setLocationLoading(true);
    const { status } = await Location.requestForegroundPermissionsAsync();
    if (status !== "granted") { setLocationLoading(false); return; }
    const loc = await Location.getCurrentPositionAsync({});
    const [geo] = await Location.reverseGeocodeAsync(loc.coords);
    setIntakeLocation(`${geo.street ?? ""} ${geo.city ?? ""} ${geo.region ?? ""}`.trim());
    setLocationLoading(false);
  }

  async function pickDocument() {
    const result = await DocumentPicker.getDocumentAsync({
      type: "*/*",
      copyToCacheDirectory: true,
      multiple: false,
    });
    if (!result.canceled) {
      const asset = result.assets[0];
      setAttachedDocs((prev) => [
        ...prev,
        { name: asset.name, uri: asset.uri, mimeType: asset.mimeType ?? "application/octet-stream" },
      ]);
    }
  }

  function handleNext() {
    if (currentStep < 2) setCurrentStep((s) => s + 1);
    else handleSubmit();
  }

  function handleSubmit() {
    const payload = {
      photos: slotPhotos,
      identity: { sex, ageEstimate, primaryColor },
      tagging: { microchipId, collarTagId },
      cnvr: {
        neuterStatus,
        surgeryDate,
        rabies: { status: rabiesStatus, dateAdmin: rabiesDateAdmin, expiry: rabiesExpiry, batch: rabiesBatch },
        dhpp: { status: dhppStatus, date: dhppDate },
      },
      location: { intake: intakeLocation, release: releaseLocation },
      health: { diseases, biteRisk },
      records: { attachedDocs, clinicName },
      notes,
    };
    console.log("Submitting intake:", payload);
    router.back();
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

      {/* ── Stepper ── */}
      <StepIndicator current={currentStep} />

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        keyboardVerticalOffset={120}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.scrollContent}
        >
          {/* ── STEP 1: Photo Capture ── */}
          {currentStep === 0 && (
            <>
              {/* Photo Slots Strip */}
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

              {/* Camera Section */}
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
              </View>
            </>
          )}

          {/* ── STEP 2: Identity & CNVR ── */}
          {currentStep === 1 && (
            <>
              {/* Physical Identifiers */}
              <FormSection icon="body-outline" title="Physical Identifiers">
                <Text style={styles.fieldLabel}>Sex</Text>
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

                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Estimated Age</Text>
                <View style={styles.segmentedRow}>
                  {(["Puppy", "<1 Year", "1-3 Years", "3+ Years"] as const).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.segmentBtn,
                        ageEstimate === opt && styles.segmentBtnActive,
                      ]}
                      onPress={() => setAgeEstimate(opt)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          ageEstimate === opt && styles.segmentTextActive,
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Primary Color / Markings</Text>
                <TextInput
                  style={styles.input}
                  placeholder="e.g. Brown with white chest"
                  placeholderTextColor={Colors.textDisabled}
                  value={primaryColor}
                  onChangeText={setPrimaryColor}
                />
              </FormSection>

              {/* Physical Tagging */}
              <FormSection icon="pricetag-outline" title="Physical Tagging" optional>
                <Text style={styles.fieldLabel}>Microchip ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="15-digit code (optional)"
                  placeholderTextColor={Colors.textDisabled}
                  value={microchipId}
                  onChangeText={setMicrochipId}
                  keyboardType="numeric"
                />

                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Collar Tag ID</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Tag number (optional)"
                  placeholderTextColor={Colors.textDisabled}
                  value={collarTagId}
                  onChangeText={setCollarTagId}
                />
              </FormSection>

              {/* Spay/Neuter Status */}
              <FormSection icon="medical-outline" title="Spay / Neuter Status">
                <View style={styles.neuterStatusLayout}>
                  <View style={styles.segmentedRow}>
                    {(["Intact", "Unknown"] as const).map((opt) => (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.segmentBtn,
                          neuterStatus === opt && styles.segmentBtnActive,
                        ]}
                        onPress={() => setNeuterStatus(opt)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.segmentTextSmall,
                            neuterStatus === opt && styles.segmentTextActive,
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                  <TouchableOpacity
                    style={[
                      styles.segmentBtnFull,
                      neuterStatus === "Neutered/Spayed" && styles.segmentBtnActive,
                    ]}
                    onPress={() => setNeuterStatus("Neutered/Spayed")}
                    activeOpacity={0.75}
                  >
                    <Text
                      style={[
                        styles.segmentTextSmall,
                        neuterStatus === "Neutered/Spayed" && styles.segmentTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      Neutered/Spayed
                    </Text>
                  </TouchableOpacity>
                </View>

                {neuterStatus === "Neutered/Spayed" && (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Date of Surgery</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="MM/DD/YYYY"
                      placeholderTextColor={Colors.textDisabled}
                      value={surgeryDate}
                      onChangeText={setSurgeryDate}
                    />
                  </>
                )}
              </FormSection>

              {/* Rabies Vaccination */}
              <FormSection icon="shield-checkmark-outline" title="Rabies Vaccination">
                <View style={styles.segmentedColumn}>
                  {(["Administered Today", "Previously Vaccinated", "Unvaccinated"] as const).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.segmentBtnFull,
                        rabiesStatus === opt && styles.segmentBtnActive,
                      ]}
                      onPress={() => setRabiesStatus(opt)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          rabiesStatus === opt && styles.segmentTextActive,
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {rabiesStatus !== "" && rabiesStatus !== "Unvaccinated" && (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Date Administered</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="MM/DD/YYYY"
                      placeholderTextColor={Colors.textDisabled}
                      value={rabiesDateAdmin}
                      onChangeText={setRabiesDateAdmin}
                    />
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Expiration Date</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="MM/DD/YYYY"
                      placeholderTextColor={Colors.textDisabled}
                      value={rabiesExpiry}
                      onChangeText={setRabiesExpiry}
                    />
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Batch / Serial Number</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Optional"
                      placeholderTextColor={Colors.textDisabled}
                      value={rabiesBatch}
                      onChangeText={setRabiesBatch}
                    />
                  </>
                )}
              </FormSection>

              {/* DHPP */}
              <FormSection icon="bandage-outline" title="Core Canine Vaccines — DHPP" optional>
                <View style={styles.segmentedRow}>
                  {(["Administered", "Previously", "Not Given"] as const).map((opt) => (
                    <TouchableOpacity
                      key={opt}
                      style={[
                        styles.segmentBtn,
                        dhppStatus === opt && styles.segmentBtnActive,
                      ]}
                      onPress={() => setDhppStatus(opt)}
                      activeOpacity={0.75}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          dhppStatus === opt && styles.segmentTextActive,
                        ]}
                      >
                        {opt}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>

                {(dhppStatus === "Administered" || dhppStatus === "Previously") && (
                  <>
                    <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Date</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="MM/DD/YYYY"
                      placeholderTextColor={Colors.textDisabled}
                      value={dhppDate}
                      onChangeText={setDhppDate}
                    />
                  </>
                )}
              </FormSection>
            </>
          )}

          {/* ── STEP 3: Health Records ── */}
          {currentStep === 2 && (
            <>
              {/* Intake Location */}
              <FormSection icon="location-outline" title="Intake Location">
                <View style={styles.locationRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    placeholder="Street address or landmark"
                    placeholderTextColor={Colors.textDisabled}
                    value={intakeLocation}
                    onChangeText={setIntakeLocation}
                  />
                  <TouchableOpacity
                    style={styles.gpsBtn}
                    onPress={fetchGPSLocation}
                    disabled={locationLoading}
                    activeOpacity={0.75}
                  >
                    {locationLoading ? (
                      <ActivityIndicator size="small" color={Colors.accent} />
                    ) : (
                      <Ionicons name="navigate" size={18} color={Colors.accent} />
                    )}
                  </TouchableOpacity>
                </View>
              </FormSection>

              {/* Observed Conditions */}
              <FormSection icon="bug-outline" title="Observed Conditions" optional>
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
                          {["Active", "Recovering", "Cleared"].map((s) => (
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
                          ))}
                        </View>
                      </View>
                    ))}
                  </View>
                )}

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

              {/* Bite Risk / Temperament */}
              <FormSection icon="warning-outline" title="Bite Risk / Temperament">
                <View style={styles.segmentedRow}>
                  {(["Safe", "Caution", "Aggressive"] as const).map((opt) => {
                    const riskColor =
                      opt === "Safe"
                        ? Colors.accent
                        : opt === "Caution"
                        ? Colors.warning
                        : Colors.error;
                    const isActive = biteRisk === opt;
                    return (
                      <TouchableOpacity
                        key={opt}
                        style={[
                          styles.segmentBtn,
                          isActive && {
                            borderColor: riskColor,
                            backgroundColor: riskColor + "18",
                          },
                        ]}
                        onPress={() => setBiteRisk(opt)}
                        activeOpacity={0.75}
                      >
                        <Text
                          style={[
                            styles.segmentText,
                            isActive && { color: riskColor },
                          ]}
                        >
                          {opt}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </FormSection>

              {/* Veterinary Records */}
              <FormSection icon="document-attach-outline" title="Veterinary Records" optional>
                <TouchableOpacity
                  style={styles.attachBtn}
                  onPress={pickDocument}
                  activeOpacity={0.75}
                >
                  <Ionicons name="attach" size={18} color={Colors.secondary} />
                  <Text style={styles.attachBtnText}>Attach File</Text>
                </TouchableOpacity>
                {attachedDocs.map((doc, i) => (
                  <View key={i} style={styles.docRow}>
                    <Ionicons
                      name="document-outline"
                      size={16}
                      color={Colors.textSecondary}
                    />
                    <Text style={styles.docName} numberOfLines={1}>
                      {doc.name}
                    </Text>
                    <TouchableOpacity
                      onPress={() =>
                        setAttachedDocs((prev) => prev.filter((_, idx) => idx !== i))
                      }
                      hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}
                    >
                      <Ionicons name="close-circle" size={18} color={Colors.error} />
                    </TouchableOpacity>
                  </View>
                ))}
              </FormSection>

              {/* Clinic / Organization */}
              <FormSection icon="business-outline" title="Clinic / Organization">
                <TextInput
                  style={styles.input}
                  placeholder="Where was this animal processed?"
                  placeholderTextColor={Colors.textDisabled}
                  value={clinicName}
                  onChangeText={setClinicName}
                />
              </FormSection>

              {/* Release Location */}
              <FormSection icon="navigate-outline" title="Release Location" optional>
                <TextInput
                  style={styles.input}
                  placeholder="Where will the animal be released?"
                  placeholderTextColor={Colors.textDisabled}
                  value={releaseLocation}
                  onChangeText={setReleaseLocation}
                />
              </FormSection>

              {/* General Notes */}
              <FormSection icon="create-outline" title="General Notes" optional>
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
            </>
          )}
        </ScrollView>

        {/* ── Bottom Navigation Bar ── */}
        <View style={styles.bottomNav}>
          {currentStep > 0 && (
            <TouchableOpacity
              style={styles.prevBtn}
              onPress={() => setCurrentStep((s) => s - 1)}
              activeOpacity={0.75}
            >
              <Ionicons name="chevron-back" size={18} color={Colors.textSecondary} />
              <Text style={styles.prevBtnText}>Back</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[
              styles.nextBtn,
              isNextDisabled && styles.nextBtnDisabled,
              currentStep === 0 && { flex: 1 },
            ]}
            onPress={handleNext}
            disabled={isNextDisabled}
            activeOpacity={0.85}
          >
            <Text
              style={[
                styles.nextBtnText,
                isNextDisabled && styles.nextBtnTextDisabled,
              ]}
            >
              {currentStep === 2 ? "Submit" : "Next"}
            </Text>
            {currentStep < 2 && (
              <Ionicons
                name="chevron-forward"
                size={18}
                color={isNextDisabled ? Colors.textDisabled : Colors.textOnDark}
              />
            )}
            {currentStep === 2 && (
              <Ionicons
                name="cloud-upload-outline"
                size={18}
                color={isNextDisabled ? Colors.textDisabled : Colors.textOnDark}
              />
            )}
          </TouchableOpacity>
        </View>
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

  // ── Step Indicator ──
  stepIndicator: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  stepItem: {
    alignItems: "center",
    gap: 4,
  },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accent,
  },
  stepNumber: {
    fontSize: 12,
    fontWeight: "700",
    color: Colors.textDisabled,
  },
  stepNumberActive: {
    color: Colors.textOnDark,
  },
  stepLabel: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textDisabled,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  stepLabelActive: {
    color: Colors.accent,
  },
  stepConnector: {
    flex: 1,
    height: 2,
    backgroundColor: Colors.border,
    marginTop: 13,
  },
  stepConnectorDone: {
    backgroundColor: Colors.accent,
  },

  // ── Scroll ──
  scrollContent: {
    paddingBottom: 20,
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
  slotOuterActive: {},
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

  // ── Form ──
  formSection: {
    marginHorizontal: 16,
    marginTop: 12,
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
    flex: 1,
  },
  optionalLabel: {
    fontSize: 10,
    fontWeight: "500",
    color: Colors.textDisabled,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginBottom: 6,
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

  // ── Segmented ──
  segmentedRow: {
    flexDirection: "row",
    gap: 8,
  },
  neuterStatusLayout: {
    gap: 8,
  },
  segmentedColumn: {
    gap: 6,
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
  segmentBtnFull: {
    paddingVertical: 10,
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
  segmentTextSmall: {
    fontSize: 13,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  segmentTextActive: {
    color: Colors.accent,
  },

  // ── Location ──
  locationRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  gpsBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
    alignItems: "center",
    justifyContent: "center",
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

  // ── Attach Docs ──
  attachBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: Colors.border,
    backgroundColor: Colors.surfaceMuted,
    marginBottom: 8,
  },
  attachBtnText: {
    fontSize: 14,
    fontWeight: "600",
    color: Colors.secondary,
  },
  docRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
    marginBottom: 6,
  },
  docName: {
    flex: 1,
    fontSize: 13,
    color: Colors.textPrimary,
  },

  // ── Bottom Navigation ──
  bottomNav: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: Colors.border,
    gap: 12,
    backgroundColor: Colors.background,
  },
  prevBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    backgroundColor: Colors.background,
  },
  prevBtnText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  nextBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 12,
    backgroundColor: Colors.accent,
  },
  nextBtnDisabled: {
    backgroundColor: Colors.surfaceMuted,
  },
  nextBtnText: {
    fontSize: 15,
    fontWeight: "700",
    color: Colors.textOnDark,
  },
  nextBtnTextDisabled: {
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
