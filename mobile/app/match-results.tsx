import { useState, useEffect, useCallback } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "jpeg-js";
import { Colors } from "@/constants/colors";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const CARD_WIDTH = (screenWidth - 16 * 2 - 12) / 2;
const PHOTO_HEIGHT = screenHeight * 0.42;

const LIKELY_MATCH_THRESHOLD = 75;
const LIKELY_MATCH_GAP = 15;

const DOG_IMGS = {
  d1: require("../assets/dogs/1.png"),
  d2: require("../assets/dogs/2.png"),
  d3: require("../assets/dogs/3.png"),
  d4: require("../assets/dogs/4.png"),
  black: require("../assets/dogs/black.png"),
};

const resolveUri = (src: ReturnType<typeof require>) =>
  Image.resolveAssetSource(src).uri;

interface MatchEntry {
  id: string;
  label: string;
  percent: number;
  isLikelyMatch: boolean;
  viewerPhotos: { id: string; uri: string }[];
  foundAddress: string;
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

const RAW_MATCHES = [
  {
    label: "#1847",
    percent: 87,
    imgs: [DOG_IMGS.d1, DOG_IMGS.d1, DOG_IMGS.d1],
    foundAddress: "2847 NW 7th Ave, Miami, FL 33127",
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
    percent: 62,
    imgs: [DOG_IMGS.d2],
    foundAddress: "1051 NW 2nd Ave, Hialeah, FL 33010",
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
    percent: 45,
    imgs: [DOG_IMGS.d3],
    foundAddress: "500 SW 8th St, Miami, FL 33130",
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
    percent: 31,
    imgs: [DOG_IMGS.d4],
    foundAddress: "13400 SW 120th St, Miami, FL 33186",
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
    percent: 28,
    imgs: [DOG_IMGS.black],
    foundAddress: "7800 SW 40th St, Miami, FL 33155",
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
    percent: 22,
    imgs: [DOG_IMGS.black],
    foundAddress: "4800 NW 183rd St, Miami Gardens, FL",
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
    percent: 15,
    imgs: [DOG_IMGS.black],
    foundAddress: "900 NE 125th St, North Miami, FL",
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
    percent: 8,
    imgs: [DOG_IMGS.black],
    foundAddress: "3300 NW 27th Ave, Miami, FL 33142",
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

const MATCHES: MatchEntry[] = RAW_MATCHES.map((m, i) => ({
  id: `match-${i}`,
  label: `Dog ${m.label}`,
  percent: m.percent,
  isLikelyMatch:
    m.percent >= LIKELY_MATCH_THRESHOLD &&
    m.percent - (RAW_MATCHES[1]?.percent ?? 0) >= LIKELY_MATCH_GAP &&
    i === 0,
  viewerPhotos: m.imgs.map((img, j) => ({
    id: `${i}-${j}`,
    uri: resolveUri(img),
  })),
  foundAddress: m.foundAddress,
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

function percentColor(pct: number): string {
  if (pct >= 75) return Colors.accent;
  if (pct >= 50) return Colors.warning;
  return Colors.textDisabled;
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
  entry: MatchEntry;
  onClose: () => void;
}) {
  const [photoIndex, setPhotoIndex] = useState(0);
  const color = percentColor(entry.percent);
  const hasMultiplePhotos = entry.viewerPhotos.length > 1;
  const currentPhotoUri = entry.viewerPhotos[photoIndex]?.uri;
  const isLightBg = useBottomBrightness(currentPhotoUri);
  const dotColor = isLightBg ? "rgba(0,0,0,0.45)" : "rgba(255,255,255,0.5)";
  const dotActiveColor = isLightBg ? "rgba(0,0,0,0.85)" : "#fff";

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.profileRoot]}>
      <SafeAreaView style={styles.profileSafe} edges={["top", "bottom"]}>
        {/* Header */}
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={onClose} style={styles.profileBackButton}>
            <Ionicons
              name="chevron-back"
              size={24}
              color={Colors.textPrimary}
            />
          </TouchableOpacity>
          <Text style={styles.profileHeaderTitle}>{entry.label}</Text>
          <View
            style={[styles.matchBadgeInline, { backgroundColor: color + "22" }]}
          >
            <Text style={[styles.matchBadgeInlineText, { color }]}>
              {entry.percent}%
            </Text>
          </View>
        </View>

        {/* Photos + info scroll together */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {/* Photo carousel */}
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
              onMomentumScrollEnd={(e) => {
                const index = Math.round(
                  e.nativeEvent.contentOffset.x / screenWidth,
                );
                setPhotoIndex(index);
              }}
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

          {/* Info content */}
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
    </View>
  );
}

function MatchCard({
  item,
  onPress,
}: {
  item: MatchEntry;
  onPress: () => void;
}) {
  const color = percentColor(item.percent);
  return (
    <TouchableOpacity
      style={[styles.card, item.isLikelyMatch && styles.cardLikelyMatch]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.imageContainer}>
        <Image
          source={{ uri: item.viewerPhotos[0].uri }}
          style={styles.cardImage}
          resizeMode="cover"
        />
        {item.isLikelyMatch && (
          <View style={styles.likelyChipOverlay}>
            <Text style={styles.likelyChipText}>Likely Match</Text>
          </View>
        )}
      </View>
      <View style={styles.cardFooter}>
        <Text style={styles.cardLabel} numberOfLines={1}>
          {item.label}
        </Text>
        <View style={[styles.percentBadge, { backgroundColor: color + "22" }]}>
          <Text style={[styles.percentText, { color }]}>{item.percent}%</Text>
        </View>
      </View>
    </TouchableOpacity>
  );
}

export default function MatchResults() {
  const router = useRouter();
  const [selectedEntry, setSelectedEntry] = useState<MatchEntry | null>(null);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <StatusBar barStyle="dark-content" />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Match Results</Text>
          <TouchableOpacity
            style={styles.closeButton}
            onPress={() => router.back()}
          >
            <Ionicons name="close" size={24} color={Colors.textPrimary} />
          </TouchableOpacity>
        </View>

        {/* Subtitle */}
        <Text style={styles.subtitle}>
          {MATCHES.length} possible matches found
        </Text>

        {/* Grid */}
        <FlatList
          data={MATCHES}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.gridContent}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <MatchCard item={item} onPress={() => setSelectedEntry(item)} />
          )}
        />
      </SafeAreaView>

      {/* Dog Profile overlay */}
      {selectedEntry && (
        <DogProfile
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
        />
      )}
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
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  closeButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  cardLikelyMatch: {
    borderWidth: 2,
    borderColor: Colors.accent,
  },
  imageContainer: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
  },
  likelyChipOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(103,192,144,0.88)",
    paddingVertical: 4,
    alignItems: "center",
  },
  likelyChipText: {
    color: Colors.white,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cardImage: {
    width: CARD_WIDTH,
    height: CARD_WIDTH,
  },
  cardFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 8,
    paddingVertical: 8,
  },
  cardLabel: {
    fontSize: 12,
    fontWeight: "600",
    color: Colors.textPrimary,
    flex: 1,
    marginRight: 6,
  },
  percentBadge: {
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 8,
  },
  percentText: {
    fontSize: 12,
    fontWeight: "700",
  },

  // Dog Profile styles
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
  matchBadgeInline: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
  },
  matchBadgeInlineText: {
    fontSize: 14,
    fontWeight: "700",
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
