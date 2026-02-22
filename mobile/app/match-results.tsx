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
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "jpeg-js";
import { Colors } from "@/constants/colors";
import { getProfile, confirmSighting } from "@/firebase/db";
import type { ProfileMatchCandidate, ProfileResponse, SearchResponse } from "@/types/api";

const { width: screenWidth, height: screenHeight } = Dimensions.get("window");
const CARD_WIDTH = (screenWidth - 16 * 2 - 12) / 2;
const PHOTO_HEIGHT = screenHeight * 0.42;

const LIKELY_MATCH_THRESHOLD = 75;
const LIKELY_MATCH_GAP = 15;

interface MatchEntry {
  id: string;
  profileId: string;
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

function profileToMatchEntry(profile: ProfileResponse, percent: number): MatchEntry {
  const diseases = (profile.diseases ?? []).map(
    (d) => `${d.name}${d.status ? ` (${d.status})` : ""}`
  );
  const viewerPhotos = (profile.photos ?? [])
    .filter((p) => p.download_url ?? p.signed_url)
    .map((p, i) => ({ id: `${p.photo_id}-${i}`, uri: (p.download_url ?? p.signed_url)! }));
  if (viewerPhotos.length === 0 && profile.photo_count > 0) {
    viewerPhotos.push({ id: "placeholder", uri: "" });
  }
  const created = profile.created_at ? new Date(profile.created_at) : null;
  const processedAgo = created
    ? (() => {
        const diff = Date.now() - created.getTime();
        if (diff < 86400000) return "Today";
        if (diff < 604800000) return `${Math.floor(diff / 86400000)} days ago`;
        if (diff < 2592000000) return `${Math.floor(diff / 604800000)} weeks ago`;
        return `${Math.floor(diff / 2592000000)} months ago`;
      })()
    : "";
  return {
    id: profile.id,
    profileId: profile.id,
    label: profile.name,
    percent,
    isLikelyMatch: percent >= LIKELY_MATCH_THRESHOLD,
    viewerPhotos,
    foundAddress: profile.intake_location ?? profile.release_location ?? "",
    processedAt: profile.clinic_name ?? "",
    diseases,
    processedAgo,
    sex: profile.sex ? profile.sex.charAt(0).toUpperCase() + profile.sex.slice(1) : undefined,
    ageEstimate: profile.age_estimate,
    primaryColor: profile.primary_color,
    microchipId: profile.microchip_id,
    collarTagId: profile.collar_tag_id,
    neuterStatus: profile.neuter_status,
    surgeryDate: profile.surgery_date,
    rabies: profile.rabies as MatchEntry["rabies"],
    dhpp: profile.dhpp as MatchEntry["dhpp"],
    biteRisk: profile.bite_risk,
    releaseLocation: profile.release_location,
    notes: profile.notes,
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

function percentColor(pct: number): string {
  if (pct >= 75) return Colors.accent;
  if (pct >= 50) return Colors.warning;
  return Colors.textDisabled;
}

const SKELETON_BG = Colors.border;

function ProfileSkeleton({ label, percent }: { label: string; percent: number }) {
  const color = percentColor(percent);
  return (
    <View style={[StyleSheet.absoluteFillObject, styles.profileRoot]}>
      <SafeAreaView style={styles.profileSafe} edges={["top"]}>
        <View style={styles.profileHeader}>
          <View style={[styles.skeletonBox, styles.skeletonBack]} />
          <Text style={styles.profileHeaderTitle}>{label}</Text>
          <View style={[styles.matchBadgeInline, { backgroundColor: color + "22" }]}>
            <Text style={[styles.matchBadgeInlineText, { color }]}>{percent}%</Text>
          </View>
        </View>
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 24 }} showsVerticalScrollIndicator={false}>
          <View style={[styles.photoCarousel, { height: PHOTO_HEIGHT }]}>
            <View style={styles.skeletonPhoto} />
          </View>
          <View style={styles.infoContent}>
            <View style={styles.skeletonSection}>
              <View style={styles.skeletonLine} />
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, { width: "60%" }]} />
            </View>
            <View style={styles.skeletonSection}>
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, { width: "70%" }]} />
            </View>
            <View style={styles.skeletonSection}>
              <View style={styles.skeletonLine} />
              <View style={styles.skeletonLine} />
              <View style={[styles.skeletonLine, { width: "50%" }]} />
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
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
  onConfirm,
}: {
  entry: MatchEntry;
  onClose: () => void;
  onConfirm?: () => void;
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
      <SafeAreaView style={styles.profileSafe} edges={["top"]}>
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
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 24 }}
          showsVerticalScrollIndicator={false}
        >
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

            {onConfirm && (
              <TouchableOpacity
                style={styles.confirmButton}
                onPress={onConfirm}
                activeOpacity={0.85}
              >
                <Ionicons name="checkmark-circle" size={22} color={Colors.textOnDark} />
                <Text style={styles.confirmButtonText}>Confirm: This is the dog!</Text>
              </TouchableOpacity>
            )}
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
        {item.viewerPhotos[0]?.uri ? (
          <Image
            source={{ uri: item.viewerPhotos[0].uri }}
            style={styles.cardImage}
            resizeMode="cover"
          />
        ) : (
          <View style={[styles.cardImage, { backgroundColor: Colors.border, alignItems: "center", justifyContent: "center" }]}>
            <Ionicons name="image-outline" size={32} color={Colors.textDisabled} />
          </View>
        )}
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

function buildMatchesFromSearch(data: SearchResponse): MatchEntry[] {
  return data.match_candidates.map((candidate: ProfileMatchCandidate, i: number, arr: ProfileMatchCandidate[]) => {
    const percent = Math.round(candidate.similarity * 100);
    return {
      id: candidate.profile_id,
      profileId: candidate.profile_id,
      label: candidate.name || `Profile #${candidate.profile_id.slice(0, 6)}`,
      percent,
      isLikelyMatch:
        i === 0 &&
        percent >= LIKELY_MATCH_THRESHOLD &&
        percent - Math.round((arr[1]?.similarity ?? 0) * 100) >= LIKELY_MATCH_GAP,
      viewerPhotos: candidate.photo_signed_url
        ? [{ id: `${i}-0`, uri: candidate.photo_signed_url }]
        : [],
      foundAddress: "",
      processedAt: "",
      diseases: [],
      processedAgo: "",
    };
  });
}

export default function MatchResults() {
  const router = useRouter();
  const params = useLocalSearchParams<{ searchData?: string; latitude?: string; longitude?: string }>();
  const [selectedEntry, setSelectedEntry] = useState<MatchEntry | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileLoadingItem, setProfileLoadingItem] = useState<MatchEntry | null>(null);
  const [profileError, setProfileError] = useState<string | null>(null);

  const { matches, hasRealData, location } = useMemo(() => {
    if (params.searchData) {
      try {
        const data: SearchResponse = JSON.parse(params.searchData);
        return {
          matches: buildMatchesFromSearch(data),
          hasRealData: true,
          location: data.location,
        };
      } catch {
        return { matches: [], hasRealData: true, location: null };
      }
    }
    return { matches: [], hasRealData: false, location: null };
  }, [params.searchData]);

  const lat = params.latitude ? parseFloat(params.latitude) : 0;
  const lng = params.longitude ? parseFloat(params.longitude) : 0;

  async function handleCardPress(item: MatchEntry) {
    setProfileLoading(true);
    setProfileLoadingItem(item);
    setProfileError(null);
    try {
      const profile = await getProfile(item.profileId);
      if (!profile) {
        setProfileError("Profile not found");
        Alert.alert("Error", "Could not load profile details.");
        return;
      }
      const fullEntry = profileToMatchEntry(profile, item.percent);
      setSelectedEntry(fullEntry);
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : "Failed to load profile");
      Alert.alert("Error", "Could not load profile details.");
    } finally {
      setProfileLoading(false);
      setProfileLoadingItem(null);
    }
  }

  async function handleConfirm() {
    if (!selectedEntry || !hasRealData) return;
    try {
      await confirmSighting(selectedEntry.profileId, lat, lng);
      Alert.alert("Confirmed", "Sighting recorded. This is the dog!");
      setSelectedEntry(null);
      router.back();
    } catch (err) {
      Alert.alert("Error", err instanceof Error ? err.message : "Failed to confirm.");
    }
  }

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
          {matches.length === 0
            ? "No matches found"
            : `${matches.length} possible match${matches.length === 1 ? "" : "es"} found`}
        </Text>

        {/* Empty state */}
        {matches.length === 0 ? (
          <View style={styles.emptyState}>
            <Ionicons name="search-outline" size={48} color={Colors.textDisabled} />
            <Text style={styles.emptyStateText}>
              {hasRealData
                ? "No similar sightings were found in the database yet."
                : "No matches to display."}
            </Text>
          </View>
        ) : (
          <FlatList
            data={matches}
            keyExtractor={(item) => item.id}
            numColumns={2}
            columnWrapperStyle={styles.row}
            contentContainerStyle={styles.gridContent}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <MatchCard item={item} onPress={() => handleCardPress(item)} />
            )}
          />
        )}
      </SafeAreaView>

      {/* Skeleton loading when fetching profile */}
      {profileLoading && profileLoadingItem && (
        <ProfileSkeleton label={profileLoadingItem.label} percent={profileLoadingItem.percent} />
      )}

      {/* Dog Profile overlay */}
      {selectedEntry && !profileLoading && (
        <DogProfile
          entry={selectedEntry}
          onClose={() => setSelectedEntry(null)}
          onConfirm={hasRealData ? handleConfirm : undefined}
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
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 12,
    paddingHorizontal: 32,
  },
  emptyStateText: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
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
  skeletonBox: {
    backgroundColor: SKELETON_BG,
    borderRadius: 8,
  },
  skeletonBack: {
    width: 36,
    height: 36,
  },
  skeletonPhoto: {
    flex: 1,
    marginHorizontal: 12,
    marginVertical: 8,
    borderRadius: 16,
    backgroundColor: SKELETON_BG,
  },
  skeletonSection: {
    backgroundColor: Colors.background,
    marginHorizontal: 16,
    marginBottom: 10,
    padding: 14,
    borderRadius: 12,
    gap: 8,
  },
  skeletonLine: {
    height: 14,
    backgroundColor: SKELETON_BG,
    borderRadius: 6,
    width: "100%",
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
  confirmButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: Colors.accent,
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 12,
    marginHorizontal: 16,
    marginTop: 20,
    marginBottom: 8,
  },
  confirmButtonText: {
    fontSize: 16,
    fontWeight: "700",
    color: Colors.textOnDark,
  },
});
