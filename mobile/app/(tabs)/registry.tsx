import { useState, useEffect, useCallback, useMemo } from "react";
import { listProfiles } from "@/firebase/db";
import type { ProfileResponse } from "@/types/api";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  Dimensions,
  StatusBar,
  ScrollView,
  TextInput,
  Modal,
  ActivityIndicator,
  Animated,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "jpeg-js";
import { Colors } from "@/constants/colors";
import * as Location from "expo-location";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const CARD_WIDTH = (screenWidth - 16 * 2 - 12) / 2;
const PHOTO_HEIGHT = screenHeight * 0.42;

interface DogEntry {
  id: string;
  label: string;
  viewerPhotos: { id: string; uri: string }[];
  foundAddress: string;
  latitude: number;
  longitude: number;
  processedAt: string;
  diseases: string[];
  processedAgo: string;
  sex?: string;
  ageEstimate?: string;
  primaryColor?: string;
  microchipId?: string;
  collarTagId?: string;
  neuterStatus?: string;
  surgeryDate?: string;
  rabies?: {
    status: string;
    dateAdmin?: string;
    expiry?: string;
    batch?: string;
  };
  dhpp?: { status: string; date?: string };
  biteRisk?: string;
  releaseLocation?: string;
  notes?: string;
}

function getDistanceKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function formatProcessedAgo(iso: string): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  const now = Date.now();
  const diffMs = now - then;
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  const diffMonths = Math.floor(diffDays / 30);
  if (diffDays < 1) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffWeeks === 1) return "1 week ago";
  if (diffWeeks < 4) return `${diffWeeks} weeks ago`;
  if (diffMonths === 1) return "1 month ago";
  if (diffMonths < 12) return `${diffMonths} months ago`;
  const diffYears = Math.floor(diffMonths / 12);
  return diffYears === 1 ? "1 year ago" : `${diffYears} years ago`;
}

function shuffleArray<T>(arr: T[]): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function profileToDogEntry(p: ProfileResponse): DogEntry {
  const rabiesRaw = (p.rabies ?? {}) as Record<string, unknown>;
  const rabies = Object.keys(rabbiesRaw).length
    ? {
        status: (rabbiesRaw.status as string) ?? "",
        dateAdmin: (rabbiesRaw.date_admin as string) ?? (rabbiesRaw.dateAdmin as string),
        expiry: (rabbiesRaw.expiry as string) ?? undefined,
        batch: (rabbiesRaw.batch as string) ?? undefined,
      }
    : undefined;
  const dhppRaw = (p.dhpp ?? {}) as Record<string, unknown>;
  const dhpp = Object.keys(dhppRaw).length
    ? {
        status: (dhppRaw.status as string) ?? "",
        date: (dhppRaw.date as string) ?? undefined,
      }
    : undefined;
  const loc = p.location_found;
  const diseases = (p.diseases ?? []).map((d) =>
    d.status ? `${d.name} (${d.status})` : d.name
  );
  const sexDisplay =
    p.sex === "male" ? "Male" : p.sex === "female" ? "Female" : p.sex;
  return {
    id: p.id,
    label: p.profile_number != null ? `Dog #${p.profile_number}` : `Dog #${p.id.slice(0, 6).toUpperCase()}`,
    viewerPhotos:
      (p.photos ?? []).length > 0
        ? (p.photos ?? []).map((ph) => ({
            id: ph.photo_id,
            uri: (ph as { download_url?: string }).download_url ?? "",
          }))
        : [{ id: "placeholder", uri: "https://placehold.co/64x64/ddd/999?text=No+Photo" }],
    foundAddress: p.intake_location ?? "",
    latitude: loc?.latitude ?? 0,
    longitude: loc?.longitude ?? 0,
    processedAt: p.clinic_name ?? "",
    diseases,
    processedAgo: formatProcessedAgo(p.created_at),
    sex: sexDisplay,
    ageEstimate: p.age_estimate,
    primaryColor: p.primary_color,
    microchipId: p.microchip_id,
    collarTagId: p.collar_tag_id,
    neuterStatus: p.neuter_status,
    surgeryDate: p.surgery_date,
    rabies,
    dhpp,
    biteRisk: p.bite_risk,
    releaseLocation: p.release_location,
    notes: p.notes,
  };
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function sampleBottomBrightness(uri: string): Promise<boolean> {
  try {
    const thumb = await ImageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: 20, height: 20 } }],
      { base64: true, format: ImageManipulator.SaveFormat.JPEG },
    );
    if (!thumb.base64) return false;

    const bytes = base64ToUint8Array(thumb.base64);
    const { data, width, height } = decode(bytes, { useTArray: true });
    const px = data as Uint8Array;

    let sum = 0;
    let count = 0;
    const bottomStart = Math.floor(height * 0.7);
    for (let y = bottomStart; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const i = (y * width + x) * 4;
        sum += 0.299 * px[i] + 0.587 * px[i + 1] + 0.114 * px[i + 2];
        count++;
      }
    }
    return sum / count > 140;
  } catch {
    return false;
  }
}

function useBottomBrightness(uri: string | undefined): boolean {
  const [isLight, setIsLight] = useState(false);

  const detect = useCallback(async () => {
    if (!uri) return;
    const result = await sampleBottomBrightness(uri);
    setIsLight(result);
  }, [uri]);

  useEffect(() => {
    detect();
  }, [detect]);

  return isLight;
}

function InfoSection({
  icon,
  title,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.infoSection}>
      <View style={styles.infoSectionHeader}>
        <Ionicons name={icon} size={16} color={Colors.textSecondary} />
        <Text style={styles.infoSectionTitle}>{title}</Text>
      </View>
      {children}
    </View>
  );
}

function parseDisease(d: string): { name: string; status: string | null } {
  const m = d.match(/^(.+?)\s*\((.+)\)$/);
  return m ? { name: m[1], status: m[2] } : { name: d, status: null };
}

function biteRiskColor(risk: string | undefined): string {
  if (risk === "Safe") return Colors.accent;
  if (risk === "Caution") return Colors.warning;
  if (risk === "Aggressive") return Colors.error;
  return Colors.textSecondary;
}

function DogProfile({
  entry,
  onClose,
}: {
  entry: DogEntry;
  onClose: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const hasMultiplePhotos = entry.viewerPhotos.length > 1;
  const currentPhotoUri = entry.viewerPhotos[photoIndex]?.uri;
  const isLightBg = useBottomBrightness(currentPhotoUri);
  const dotColor = isLightBg ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.5)";
  const dotActiveColor = isLightBg ? "rgba(0,0,0,0.85)" : "#fff";

  const slideAnim = useState(() => new Animated.Value(screenWidth))[0];

  useEffect(() => {
    Animated.spring(slideAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 65,
      friction: 11,
    }).start();
  }, [slideAnim]);

  const handleClose = useCallback(() => {
    Animated.timing(slideAnim, {
      toValue: screenWidth,
      duration: 250,
      useNativeDriver: true,
    }).start(() => onClose());
  }, [slideAnim, onClose]);

  return (
    <Animated.View
      style={[
        StyleSheet.absoluteFillObject,
        styles.profileRoot,
        { transform: [{ translateX: slideAnim }] },
      ]}
    >
      <SafeAreaView style={styles.profileSafe} edges={["top"]}>
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={handleClose} style={styles.profileBackButton}>
            <Ionicons
              name="chevron-back"
              size={24}
              color={Colors.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.profileHeaderTitle}>{entry.label}</Text>
          <View style={styles.profileHeaderSpacer} />
        </View>

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
          <View
            style={[
              styles.photoCarousel,
              { height: PHOTO_HEIGHT, overflow: "hidden" },
            ]}
          >
            <FlatList
              data={entry.viewerPhotos}
              keyExtractor={(p) => p.id}
              horizontal
              pagingEnabled
              showsHorizontalScrollIndicator={false}
              onScroll={(e) => {
                const index = Math.round(
                  e.nativeEvent.contentOffset.x / screenWidth,
                );
                if (index !== photoIndex) setPhotoIndex(index);
              }}
              scrollEventThrottle={16}
              renderItem={({ item }) => (
                <View
                  style={{
                    width: screenWidth,
                    height: PHOTO_HEIGHT,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                  }}
                >
                  <Image
                    source={{ uri: item.uri }}
                    style={{
                      flex: 1,
                      borderRadius: 16,
                    }}
                    resizeMode="cover"
                  />
                </View>
              )}
            />
            {hasMultiplePhotos && (
              <View style={styles.dotRow}>
                <BlurView
                  intensity={30}
                  tint={isLightBg ? "light" : "dark"}
                  style={styles.dotPill}
                >
                  {entry.viewerPhotos.map((_, i) => (
                    <View
                      key={i}
                      style={[
                        styles.dot,
                        { backgroundColor: dotColor },
                        i === photoIndex && { backgroundColor: dotActiveColor },
                      ]}
                    />
                  ))}
                </BlurView>
              </View>
            )}
          </View>

          <View style={styles.infoContent}>
            {(entry.sex || entry.ageEstimate || entry.primaryColor) && (
              <InfoSection icon="body-outline" title="Identity">
                {entry.sex && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Sex</Text>
                    <Text style={styles.detailValue}>{entry.sex}</Text>
                  </View>
                )}
                {entry.ageEstimate && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Age</Text>
                    <Text style={styles.detailValue}>{entry.ageEstimate}</Text>
                  </View>
                )}
                {entry.primaryColor && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Color / Markings</Text>
                    <Text style={styles.detailValue}>{entry.primaryColor}</Text>
                  </View>
                )}
              </InfoSection>
            )}

            {(entry.microchipId || entry.collarTagId) && (
              <InfoSection icon="pricetag-outline" title="Physical Tagging">
                {entry.microchipId && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Microchip ID</Text>
                    <Text style={styles.detailValue}>{entry.microchipId}</Text>
                  </View>
                )}
                {entry.collarTagId && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Collar Tag ID</Text>
                    <Text style={styles.detailValue}>{entry.collarTagId}</Text>
                  </View>
                )}
              </InfoSection>
            )}

            {(entry.neuterStatus || entry.rabies || entry.dhpp) && (
              <InfoSection icon="medical-outline" title="CNVR Status">
                {entry.neuterStatus && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Spay / Neuter</Text>
                    <View style={[styles.cnvrPill, { backgroundColor: Colors.accent + "22" }]}>
                      <Text style={[styles.cnvrPillText, { color: Colors.accent }]}>
                        {entry.neuterStatus}
                      </Text>
                    </View>
                  </View>
                )}
                {entry.neuterStatus === "Neutered/Spayed" && entry.surgeryDate && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Surgery Date</Text>
                    <Text style={styles.detailValue}>{entry.surgeryDate}</Text>
                  </View>
                )}
              </InfoSection>
            )}

            {entry.rabies && entry.rabies.status && (
              <InfoSection icon="shield-checkmark-outline" title="Rabies Vaccination">
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View
                    style={[
                      styles.cnvrPill,
                      {
                        backgroundColor:
                          entry.rabies.status === "Unvaccinated"
                            ? Colors.error + "22"
                            : Colors.accent + "22",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.cnvrPillText,
                        {
                          color:
                            entry.rabies.status === "Unvaccinated"
                              ? Colors.error
                              : Colors.accent,
                        },
                      ]}
                    >
                      {entry.rabies.status}
                    </Text>
                  </View>
                </View>
                {entry.rabies.dateAdmin && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date Administered</Text>
                    <Text style={styles.detailValue}>{entry.rabies.dateAdmin}</Text>
                  </View>
                )}
                {entry.rabies.expiry && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Expires</Text>
                    <Text style={styles.detailValue}>{entry.rabies.expiry}</Text>
                  </View>
                )}
                {entry.rabies.batch && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Batch</Text>
                    <Text style={styles.detailValue}>{entry.rabies.batch}</Text>
                  </View>
                )}
              </InfoSection>
            )}

            {entry.dhpp && entry.dhpp.status && (
              <InfoSection icon="bandage-outline" title="DHPP Vaccination">
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status</Text>
                  <View
                    style={[
                      styles.cnvrPill,
                      {
                        backgroundColor:
                          entry.dhpp.status === "Not Given"
                            ? Colors.textDisabled + "22"
                            : Colors.accent + "22",
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.cnvrPillText,
                        {
                          color:
                            entry.dhpp.status === "Not Given"
                              ? Colors.textDisabled
                              : Colors.accent,
                        },
                      ]}
                    >
                      {entry.dhpp.status}
                    </Text>
                  </View>
                </View>
                {entry.dhpp.date && (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Date</Text>
                    <Text style={styles.detailValue}>{entry.dhpp.date}</Text>
                  </View>
                )}
              </InfoSection>
            )}

            <InfoSection icon="location-outline" title="Found Location">
              <Text style={styles.infoText}>{entry.foundAddress}</Text>
            </InfoSection>

            {entry.biteRisk && (
              <InfoSection icon="warning-outline" title="Bite Risk / Temperament">
                <View
                  style={[
                    styles.riskPill,
                    { backgroundColor: biteRiskColor(entry.biteRisk) + "22" },
                  ]}
                >
                  <Text
                    style={[styles.riskPillText, { color: biteRiskColor(entry.biteRisk) }]}
                  >
                    {entry.biteRisk}
                  </Text>
                </View>
              </InfoSection>
            )}

            <InfoSection icon="flask-outline" title="Health Findings">
              {entry.diseases.length === 0 ? (
                <Text style={styles.infoText}>None detected</Text>
              ) : (
                <View style={styles.diseaseTable}>
                  {entry.diseases.map((d, i) => {
                    const { name, status } = parseDisease(d);
                    const pillColor = Colors.accent;
                    return (
                      <View
                        key={i}
                        style={[
                          styles.diseaseRow,
                          i < entry.diseases.length - 1 &&
                            styles.diseaseRowDivider,
                        ]}
                      >
                        <Text style={styles.diseaseName}>{name}</Text>
                        {status && (
                          <View
                            style={[
                              styles.diseaseStatusPill,
                              { backgroundColor: pillColor + "22" },
                            ]}
                          >
                            <Text
                              style={[
                                styles.diseaseStatusText,
                                { color: pillColor },
                              ]}
                            >
                              {status}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </InfoSection>

            <InfoSection icon="medical-outline" title="Processed At">
              <Text style={styles.infoText}>{entry.processedAt}</Text>
            </InfoSection>

            {entry.releaseLocation && (
              <InfoSection icon="navigate-outline" title="Release Location">
                <Text style={styles.infoText}>{entry.releaseLocation}</Text>
              </InfoSection>
            )}

            {entry.notes && (
              <InfoSection icon="create-outline" title="Notes">
                <Text style={styles.infoText}>{entry.notes}</Text>
              </InfoSection>
            )}

            <InfoSection icon="time-outline" title="Processed">
              <Text style={styles.infoText}>{entry.processedAgo}</Text>
            </InfoSection>
          </View>
        </ScrollView>
      </SafeAreaView>
    </Animated.View>
  );
}

type LocationSource = "my" | "custom";

const DISTANCE_OPTIONS_MI = [
  { label: "5 mi", valueKm: 5 * 1.60934 },
  { label: "10 mi", valueKm: 10 * 1.60934 },
  { label: "25 mi", valueKm: 25 * 1.60934 },
  { label: "50 mi", valueKm: 50 * 1.60934 },
  { label: "Any", valueKm: null as number | null },
] as const;

async function geocodeAddress(address: string): Promise<{ lat: number; lon: number } | null> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1`,
      { headers: { "User-Agent": "StrayHub/1.0" } }
    );
    const data = await res.json();
    if (Array.isArray(data) && data.length > 0) {
      return { lat: parseFloat(data[0].lat), lon: parseFloat(data[0].lon) };
    }
    return null;
  } catch {
    return null;
  }
}

function LocationFilterModal({
  visible,
  onClose,
  onApply,
  onClear,
  locationSource,
  setLocationSource,
  customAddress,
  setCustomAddress,
  maxDistanceKm,
  setMaxDistanceKm,
  isLoadingLocation,
  locationError,
  currentAddressPreview,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (opts: {
    lat: number;
    lon: number;
    maxDistanceKm: number | null;
  }) => void;
  onClear: () => void;
  locationSource: LocationSource;
  setLocationSource: (s: LocationSource) => void;
  customAddress: string;
  setCustomAddress: (s: string) => void;
  maxDistanceKm: number | null;
  setMaxDistanceKm: (v: number | null) => void;
  isLoadingLocation: boolean;
  locationError: string | null;
  currentAddressPreview: string | null;
}) {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);
  const slideAnim = useState(() => new Animated.Value(screenHeight))[0];

  useEffect(() => {
    if (visible) {
      slideAnim.setValue(screenHeight);
      Animated.spring(slideAnim, {
        toValue: 0,
        useNativeDriver: true,
        tension: 65,
        friction: 11,
      }).start();
    } else {
      slideAnim.setValue(screenHeight);
    }
  }, [visible, slideAnim]);

  const handleApply = async () => {
    if (locationSource === "my") {
      setGeocodeError(null);
      const { status } = await Location.getForegroundPermissionsAsync();
      if (status !== "granted") {
        const { status: newStatus } = await Location.requestForegroundPermissionsAsync();
        if (newStatus !== "granted") {
          setGeocodeError("Location permission denied");
          return;
        }
      }
      try {
        const pos = await Location.getCurrentPositionAsync({});
        onApply({
          lat: pos.coords.latitude,
          lon: pos.coords.longitude,
          maxDistanceKm,
        });
        onClose();
      } catch {
        setGeocodeError("Could not get your location");
      }
      return;
    }
    if (locationSource === "custom" && customAddress.trim()) {
      setIsGeocoding(true);
      setGeocodeError(null);
      const coords = await geocodeAddress(customAddress.trim());
      setIsGeocoding(false);
      if (coords) {
        onApply({ lat: coords.lat, lon: coords.lon, maxDistanceKm });
        onClose();
      } else {
        setGeocodeError("Could not find that address");
      }
      return;
    }
  };

  const handleClear = () => {
    onClear();
    onClose();
  };

  const canApply =
    locationSource === "my" ||
    (locationSource === "custom" && customAddress.trim().length > 0);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <Animated.View
          style={[
            styles.modalContent,
            { transform: [{ translateY: slideAnim }] },
          ]}
        >
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Filter by location</Text>

          <Text style={styles.filterSectionLabel}>Location</Text>
          <View style={styles.locationSourceRow}>
            <TouchableOpacity
              style={[
                styles.locationSourceOption,
                locationSource === "my" && styles.locationSourceOptionActive,
              ]}
              onPress={() => setLocationSource("my")}
            >
              <Ionicons
                name="navigate"
                size={18}
                color={locationSource === "my" ? Colors.accent : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.locationSourceText,
                  locationSource === "my" && styles.locationSourceTextActive,
                ]}
              >
                My location
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.locationSourceOption,
                locationSource === "custom" && styles.locationSourceOptionActive,
              ]}
              onPress={() => setLocationSource("custom")}
            >
              <Ionicons
                name="location"
                size={18}
                color={locationSource === "custom" ? Colors.accent : Colors.textSecondary}
              />
              <Text
                style={[
                  styles.locationSourceText,
                  locationSource === "custom" && styles.locationSourceTextActive,
                ]}
              >
                Custom address
              </Text>
            </TouchableOpacity>
          </View>

          {locationSource === "my" && (
            <View style={styles.addressPreview}>
              {isLoadingLocation ? (
                <ActivityIndicator size="small" color={Colors.accent} />
              ) : locationError ? (
                <Text style={styles.addressPreviewError}>{locationError}</Text>
              ) : currentAddressPreview ? (
                <Text style={styles.addressPreviewText} numberOfLines={2}>
                  {currentAddressPreview}
                </Text>
              ) : (
                <Text style={styles.addressPreviewPlaceholder}>
                  Tap Apply to use your current location
                </Text>
              )}
            </View>
          )}

          {locationSource === "custom" && (
            <TextInput
              style={styles.customAddressInput}
              placeholder="Enter an address..."
              placeholderTextColor={Colors.textDisabled}
              value={customAddress}
              onChangeText={(t) => {
                setCustomAddress(t);
                setGeocodeError(null);
              }}
              autoCapitalize="words"
            />
          )}

          {(locationError || geocodeError) && (
            <Text style={styles.filterError}>{locationError || geocodeError}</Text>
          )}

          <Text style={[styles.filterSectionLabel, { marginTop: 16 }]}>Within distance</Text>
          <View style={styles.distanceOptionsRow}>
            {DISTANCE_OPTIONS_MI.map((opt) => (
              <TouchableOpacity
                key={opt.label}
                style={[
                  styles.distancePill,
                  { flex: 1 },
                  (maxDistanceKm === opt.valueKm ||
                    (maxDistanceKm == null && opt.valueKm == null)) &&
                    styles.distancePillActive,
                ]}
                onPress={() => setMaxDistanceKm(opt.valueKm)}
              >
                <Text
                  style={[
                    styles.distancePillText,
                    (maxDistanceKm === opt.valueKm ||
                      (maxDistanceKm == null && opt.valueKm == null)) &&
                      styles.distancePillTextActive,
                  ]}
                >
                  {opt.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.clearButton} onPress={handleClear}>
              <Text style={styles.clearButtonText}>Clear</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.applyButton, (!canApply || isGeocoding) && styles.applyButtonDisabled]}
              onPress={handleApply}
              disabled={!canApply || isGeocoding}
            >
              {isGeocoding ? (
                <ActivityIndicator size="small" color={Colors.white} />
              ) : (
                <Text style={styles.applyButtonText}>Apply</Text>
              )}
            </TouchableOpacity>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

function DogCard({
  item,
  onPress,
  distanceKm,
}: {
  item: DogEntry;
  onPress: () => void;
  distanceKm?: number;
}) {
  const distanceLabel =
    distanceKm != null ? `${(distanceKm * 0.621371).toFixed(1)} mi` : null;

  return (
    <TouchableOpacity
      style={styles.card}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: item.viewerPhotos[0].uri }}
          style={styles.cardImage}
          resizeMode="cover"
        />
        {distanceLabel != null && (
          <View style={styles.distanceBadge}>
            <Ionicons name="location" size={10} color={Colors.textOnDark} />
            <Text style={styles.distanceBadgeText}>{distanceLabel}</Text>
          </View>
        )}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardLabel} numberOfLines={1}>
          {item.label}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

export default function RegistryScreen() {
  const [dogs, setDogs] = useState<DogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<DogEntry | null>(null);
  const [filterModalVisible, setFilterModalVisible] = useState(false);
  const [locationSource, setLocationSource] = useState<LocationSource>("my");
  const [customAddress, setCustomAddress] = useState("");
  const [maxDistanceKm, setMaxDistanceKm] = useState<number | null>(null);
  const [referenceLocation, setReferenceLocation] = useState<{
    lat: number;
    lon: number;
    maxDistanceKm: number | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const profiles = await listProfiles();
        if (!cancelled) {
          setDogs(profiles.map(profileToDogEntry));
        }
      } catch (err) {
        console.error("Failed to load profiles:", err);
        if (!cancelled) setDogs([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredDogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = !q ? dogs : dogs.filter((d) => d.label.toLowerCase().includes(q));

    if (referenceLocation) {
      const { lat, lon, maxDistanceKm: maxKm } = referenceLocation;
      const withDistance = list.map((dog) => ({
        dog,
        distance:
          dog.latitude !== 0 || dog.longitude !== 0
            ? getDistanceKm(dog.latitude, dog.longitude, lat, lon)
            : null,
      }));
      const filtered =
        maxKm != null
          ? withDistance.filter(
              ({ distance }) => distance === null || distance <= maxKm
            )
          : withDistance;
      const shuffled = shuffleArray(filtered);
      return shuffled.map(({ dog, distance }) => ({
        ...dog,
        _distanceKm: distance ?? undefined,
      }));
    }
    return list.map((d) => ({ ...d, _distanceKm: undefined as number | undefined }));
  }, [dogs, searchQuery, referenceLocation]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top"]}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.searchRow}>
          <View style={styles.searchContainer}>
            <Ionicons
              name="search"
              size={18}
              color={Colors.textSecondary}
              style={styles.searchIcon}
            />
            <TextInput
              style={styles.searchInput}
              placeholder="Search by ID..."
              placeholderTextColor={Colors.textDisabled}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery("")}
                style={styles.searchClear}
              >
                <Ionicons name="close-circle" size={18} color={Colors.textSecondary} />
              </TouchableOpacity>
            )}
          </View>
          <TouchableOpacity
            style={[
              styles.sortButton,
              referenceLocation != null && styles.sortButtonActive,
            ]}
            onPress={() => setFilterModalVisible(true)}
          >
            <Ionicons
              name="options-outline"
              size={20}
              color={referenceLocation != null ? Colors.accent : Colors.textSecondary}
            />
          </TouchableOpacity>
        </View>

        {loading ? (
          <View style={styles.emptyState}>
            <ActivityIndicator size="large" color={Colors.accent} />
            <Text style={[styles.emptyText, { marginTop: 12 }]}>Loading registry...</Text>
          </View>
        ) : filteredDogs.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons
              name="paw-outline"
              size={48}
              color={Colors.textDisabled}
              style={styles.emptyIcon}
            />
            <Text style={styles.emptyText}>No dogs found</Text>
          </View>
        ) : (
          <FlatList
            data={filteredDogs}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <DogCard
                item={item}
                onPress={() => setSelectedEntry(item)}
                distanceKm={item._distanceKm}
              />
            )}
          />
        )}
      </SafeAreaView>

      {selectedEntry && (
        <DogProfile
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}

      <LocationFilterModal
        visible={filterModalVisible}
        onClose={() => setFilterModalVisible(false)}
        onApply={(opts) =>
          setReferenceLocation({
            lat: opts.lat,
            lon: opts.lon,
            maxDistanceKm: opts.maxDistanceKm,
          })
        }
        onClear={() => setReferenceLocation(null)}
        locationSource={locationSource}
        setLocationSource={setLocationSource}
        customAddress={customAddress}
        setCustomAddress={setCustomAddress}
        maxDistanceKm={maxDistanceKm}
        setMaxDistanceKm={setMaxDistanceKm}
        isLoadingLocation={false}
        locationError={null}
        currentAddressPreview={null}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: Colors.white,
  },
  safeArea: {
    flex: 1,
  },
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 12,
    gap: 8,
  },
  searchContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
    paddingVertical: 0,
  },
  searchClear: {
    padding: 4,
  },
  sortButton: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: Colors.background,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  sortButtonActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingBottom: 80,
  },
  emptyIcon: {
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 16,
    color: Colors.textSecondary,
  },
  gridContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 24,
    gap: 12,
  },
  row: {
    gap: 12,
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: 12,
    backgroundColor: Colors.surface,
    overflow: "hidden",
    shadowColor: "#000",
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    borderWidth: 1,
    borderColor: Colors.border,
  },
  imageContainer: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
  },
  cardImage: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
  },
  cardFooter: {
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textPrimary,
  },
  distanceBadge: {
    position: "absolute",
    bottom: 6,
    right: 6,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: "rgba(0,0,0,0.6)",
  },
  distanceBadgeText: {
    fontSize: 10,
    fontWeight: "600",
    color: Colors.textOnDark,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.4)",
    justifyContent: "flex-end",
    paddingBottom: 0,
  },
  modalContent: {
    backgroundColor: Colors.white,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 34,
    zIndex: 1,
    elevation: 1,
  },
  modalHandle: {
    width: 36,
    height: 4,
    backgroundColor: Colors.border,
    borderRadius: 2,
    alignSelf: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
    marginBottom: 20,
  },
  filterSectionLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  locationSourceRow: {
    flexDirection: "row",
    gap: 10,
  },
  locationSourceOption: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: "transparent",
  },
  locationSourceOptionActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  locationSourceText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  locationSourceTextActive: {
    color: Colors.accent,
    fontWeight: "600",
  },
  addressPreview: {
    marginTop: 10,
    padding: 12,
    borderRadius: 12,
    backgroundColor: Colors.background,
    minHeight: 44,
    justifyContent: "center",
  },
  addressPreviewText: {
    fontSize: 13,
    color: Colors.textPrimary,
  },
  addressPreviewPlaceholder: {
    fontSize: 13,
    color: Colors.textDisabled,
  },
  addressPreviewError: {
    fontSize: 13,
    color: Colors.error,
  },
  customAddressInput: {
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: Colors.background,
    borderWidth: 1,
    borderColor: Colors.border,
    fontSize: 15,
    color: Colors.textPrimary,
  },
  filterError: {
    fontSize: 13,
    color: Colors.error,
    marginTop: 8,
  },
  sortOrderRow: {
    flexDirection: "row",
    gap: 10,
  },
  distanceOptionsRow: {
    flexDirection: "row",
    gap: 6,
  },
  distancePill: {
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderRadius: 10,
    backgroundColor: Colors.background,
    borderWidth: 2,
    borderColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  distancePillActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  distancePillText: {
    fontSize: 12,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  distancePillTextActive: {
    color: Colors.accent,
    fontWeight: "600",
  },
  sortPill: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
    borderWidth: 2,
    borderColor: "transparent",
  },
  sortPillActive: {
    borderColor: Colors.accent,
    backgroundColor: Colors.accentSubtle,
  },
  sortPillText: {
    fontSize: 14,
    color: Colors.textSecondary,
    fontWeight: "500",
  },
  sortPillTextActive: {
    color: Colors.accent,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  clearButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.background,
    alignItems: "center",
  },
  clearButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textSecondary,
  },
  applyButton: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: Colors.accent,
    alignItems: "center",
  },
  applyButtonDisabled: {
    backgroundColor: Colors.surfaceMuted,
    opacity: 0.7,
  },
  applyButtonText: {
    fontSize: 15,
    fontWeight: "600",
    color: Colors.textOnDark,
  },
  profileRoot: {
    backgroundColor: Colors.white,
  },
  profileSafe: {
    flex: 1,
  },
  profileHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 8,
  },
  profileBackButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  profileHeaderTitle: {
    fontSize: 18,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  profileHeaderSpacer: {
    width: 36,
  },
  photoCarousel: {
    width: screenWidth,
  },
  dotRow: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
  },
  dotPill: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    overflow: "hidden",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  infoContent: {
    paddingVertical: 16,
  },
  infoSection: {
    borderRadius: 12,
    backgroundColor: Colors.background,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
  },
  infoSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginBottom: 6,
  },
  infoSectionTitle: {
    fontSize: 11,
    fontWeight: "700",
    color: Colors.textSecondary,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  infoText: {
    fontSize: 14,
    color: Colors.textPrimary,
    lineHeight: 20,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  detailLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textSecondary,
    marginRight: 8,
  },
  detailValue: {
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
    textAlign: "right",
  },
  cnvrPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    alignSelf: "flex-end",
  },
  cnvrPillText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
  riskPill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  riskPillText: {
    fontSize: 13,
    fontWeight: "700",
  },
  diseaseTable: {
    gap: 0,
  },
  diseaseRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
  },
  diseaseRowDivider: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: Colors.border,
  },
  diseaseName: {
    fontSize: 14,
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 8,
  },
  diseaseStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  diseaseStatusText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "capitalize",
  },
});
