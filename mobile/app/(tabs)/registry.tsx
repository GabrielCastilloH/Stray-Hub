import { useState, useEffect, useCallback, useMemo } from "react";
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

const DOG_IMGS = {
  d1: require("../../assets/dogs/1.png"),
  d2: require("../../assets/dogs/2.png"),
  d3: require("../../assets/dogs/3.png"),
  d4: require("../../assets/dogs/4.png"),
  black: require("../../assets/dogs/black.png"),
};

const resolveUri = (src: ReturnType<typeof require>) =>
  Image.resolveAssetSource(src).uri;

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

const RAW_DOGS = [
  {
    label: "#1847",
    imgs: [DOG_IMGS.d1, DOG_IMGS.d1, DOG_IMGS.d1],
    foundAddress: "2847 NW 7th Ave, Miami, FL 33127",
    latitude: 25.8025,
    longitude: -80.2119,
    processedAt: "City of Miami Animal Services",
    diseases: ["Ehrlichia (treated)", "Ringworm (cleared)"],
    processedAgo: "3 months ago",
    sex: "Male",
    ageEstimate: "1-3 Years",
    primaryColor: "Tan with white chest",
    microchipId: "982000123456789",
    neuterStatus: "Neutered/Spayed",
    surgeryDate: "01/15/2024",
    rabies: { status: "Previously Vaccinated", dateAdmin: "02/10/2024", expiry: "02/10/2027", batch: "RB-2024-001" },
    dhpp: { status: "Previously", date: "02/10/2024" },
    biteRisk: "Safe",
    releaseLocation: "2847 NW 7th Ave, Miami, FL 33127",
    notes: "Friendly, responds well to treats.",
  },
  {
    label: "#0392",
    imgs: [DOG_IMGS.d2],
    foundAddress: "1051 NW 2nd Ave, Hialeah, FL 33010",
    latitude: 25.8298,
    longitude: -80.2812,
    processedAt: "Hialeah Animal Shelter",
    diseases: [],
    processedAgo: "6 weeks ago",
    sex: "Female",
    ageEstimate: "Puppy",
    primaryColor: "Black and white",
    neuterStatus: "Intact",
    rabies: { status: "Administered Today", dateAdmin: "01/05/2025", expiry: "01/05/2028" },
    dhpp: { status: "Administered", date: "01/05/2025" },
    biteRisk: "Caution",
    notes: "Shy around new people.",
  },
  {
    label: "#2201",
    imgs: [DOG_IMGS.d3],
    foundAddress: "500 SW 8th St, Miami, FL 33130",
    latitude: 25.7658,
    longitude: -80.2052,
    processedAt: "Doral Animal Clinic",
    diseases: ["Parvovirus (recovered)", "Mange (cleared)"],
    processedAgo: "5 months ago",
    sex: "Male",
    ageEstimate: "3+ Years",
    primaryColor: "Brown",
    collarTagId: "TAG-4421",
    neuterStatus: "Neutered/Spayed",
    surgeryDate: "09/22/2023",
    rabies: { status: "Previously Vaccinated", dateAdmin: "10/01/2023", expiry: "10/01/2026" },
    dhpp: { status: "Previously", date: "10/01/2023" },
    biteRisk: "Safe",
    releaseLocation: "500 SW 8th St, Miami, FL 33130",
  },
  {
    label: "#0715",
    imgs: [DOG_IMGS.d4],
    foundAddress: "13400 SW 120th St, Miami, FL 33186",
    latitude: 25.6516,
    longitude: -80.3628,
    processedAt: "South Miami Shelter",
    diseases: [],
    processedAgo: "2 weeks ago",
    sex: "Female",
    ageEstimate: "<1 Year",
    primaryColor: "Golden with black muzzle",
    microchipId: "982000987654321",
    neuterStatus: "Neutered/Spayed",
    surgeryDate: "02/01/2025",
    rabies: { status: "Administered Today", dateAdmin: "02/01/2025", expiry: "02/01/2028" },
    dhpp: { status: "Administered", date: "02/01/2025" },
    biteRisk: "Safe",
  },
  {
    label: "#3388",
    imgs: [DOG_IMGS.black],
    foundAddress: "7800 SW 40th St, Miami, FL 33155",
    latitude: 25.7178,
    longitude: -80.3648,
    processedAt: "West Kendall Animal Hospital",
    diseases: ["Distemper (recovered)"],
    processedAgo: "4 months ago",
    sex: "Male",
    ageEstimate: "1-3 Years",
    primaryColor: "Black",
    neuterStatus: "Unknown",
    rabies: { status: "Unvaccinated" },
    dhpp: { status: "Not Given" },
    biteRisk: "Aggressive",
    notes: "Requires muzzle for handling. History of trauma.",
  },
  {
    label: "#1122",
    imgs: [DOG_IMGS.black],
    foundAddress: "4800 NW 183rd St, Miami Gardens, FL",
    latitude: 25.9546,
    longitude: -80.2142,
    processedAt: "Miami Gardens Rescue",
    diseases: [],
    processedAgo: "7 weeks ago",
    sex: "Unknown",
    ageEstimate: "1-3 Years",
    primaryColor: "Black",
    neuterStatus: "Intact",
    rabies: { status: "Previously Vaccinated", dateAdmin: "12/01/2023", expiry: "12/01/2026" },
    dhpp: { status: "Previously", date: "12/01/2023" },
    biteRisk: "Safe",
  },
  {
    label: "#4456",
    imgs: [DOG_IMGS.black],
    foundAddress: "900 NE 125th St, North Miami, FL",
    latitude: 25.8909,
    longitude: -80.1871,
    processedAt: "North Miami Animal Care",
    diseases: ["Heartworm (treated)"],
    processedAgo: "2 months ago",
    sex: "Female",
    ageEstimate: "3+ Years",
    primaryColor: "Black with grey muzzle",
    microchipId: "982000555666777",
    neuterStatus: "Neutered/Spayed",
    surgeryDate: "08/15/2022",
    rabies: { status: "Previously Vaccinated", dateAdmin: "11/20/2024", expiry: "11/20/2027" },
    dhpp: { status: "Previously", date: "11/20/2024" },
    biteRisk: "Caution",
    releaseLocation: "900 NE 125th St, North Miami, FL",
  },
  {
    label: "#0099",
    imgs: [DOG_IMGS.black],
    foundAddress: "3300 NW 27th Ave, Miami, FL 33142",
    latitude: 25.8148,
    longitude: -80.2512,
    processedAt: "Allapattah Pet Clinic",
    diseases: [],
    processedAgo: "5 weeks ago",
    sex: "Male",
    ageEstimate: "<1 Year",
    primaryColor: "Brindle",
    neuterStatus: "Intact",
    rabies: { status: "Administered Today", dateAdmin: "01/15/2025", expiry: "01/15/2028" },
    dhpp: { status: "Not Given" },
    biteRisk: "Safe",
  },
];

const ALL_DOGS: DogEntry[] = RAW_DOGS.map((m, i) => ({
  id: `dog-${i}`,
  label: `Dog ${m.label}`,
  viewerPhotos: m.imgs.map((img, j) => ({
    id: `${i}-${j}`,
    uri: resolveUri(img),
  })),
  foundAddress: m.foundAddress,
  latitude: m.latitude,
  longitude: m.longitude,
  processedAt: m.processedAt,
  diseases: m.diseases,
  processedAgo: m.processedAgo,
  sex: m.sex,
  ageEstimate: m.ageEstimate,
  primaryColor: m.primaryColor,
  microchipId: m.microchipId,
  collarTagId: m.collarTagId,
  neuterStatus: m.neuterStatus,
  surgeryDate: m.surgeryDate,
  rabies: m.rabies,
  dhpp: m.dhpp,
  biteRisk: m.biteRisk,
  releaseLocation: m.releaseLocation,
  notes: m.notes,
}));

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
      <SafeAreaView style={styles.profileSafe} edges={["top", "bottom"]}>
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

        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
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

  const filteredDogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = !q ? ALL_DOGS : ALL_DOGS.filter((d) => d.label.toLowerCase().includes(q));

    if (referenceLocation) {
      const { lat, lon, maxDistanceKm: maxKm } = referenceLocation;
      const withDistance = list.map((dog) => ({
        dog,
        distance: getDistanceKm(dog.latitude, dog.longitude, lat, lon),
      }));
      const filtered =
        maxKm != null
          ? withDistance.filter(({ distance }) => distance <= maxKm)
          : withDistance;
      filtered.sort((a, b) => a.distance - b.distance);
      return filtered.map(({ dog, distance }) => ({ ...dog, _distanceKm: distance }));
    }
    return list.map((d) => ({ ...d, _distanceKm: undefined as number | undefined }));
  }, [searchQuery, referenceLocation]);

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

        {filteredDogs.length === 0 ? (
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
