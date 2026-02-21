import { useState } from "react";
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
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
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
  },
  {
    label: "#0392",
    percent: 62,
    imgs: [DOG_IMGS.d2],
    foundAddress: "1051 NW 2nd Ave, Hialeah, FL 33010",
    processedAt: "Hialeah Animal Shelter",
    diseases: [],
    processedAgo: "6 weeks ago",
  },
  {
    label: "#2201",
    percent: 45,
    imgs: [DOG_IMGS.d3],
    foundAddress: "500 SW 8th St, Miami, FL 33130",
    processedAt: "Doral Animal Clinic",
    diseases: ["Parvovirus (recovered)", "Mange (cleared)"],
    processedAgo: "5 months ago",
  },
  {
    label: "#0715",
    percent: 31,
    imgs: [DOG_IMGS.d4],
    foundAddress: "13400 SW 120th St, Miami, FL 33186",
    processedAt: "South Miami Shelter",
    diseases: [],
    processedAgo: "2 weeks ago",
  },
  {
    label: "#3388",
    percent: 28,
    imgs: [DOG_IMGS.black],
    foundAddress: "7800 SW 40th St, Miami, FL 33155",
    processedAt: "West Kendall Animal Hospital",
    diseases: ["Distemper (recovered)"],
    processedAgo: "4 months ago",
  },
  {
    label: "#1122",
    percent: 22,
    imgs: [DOG_IMGS.black],
    foundAddress: "4800 NW 183rd St, Miami Gardens, FL",
    processedAt: "Miami Gardens Rescue",
    diseases: [],
    processedAgo: "7 weeks ago",
  },
  {
    label: "#4456",
    percent: 15,
    imgs: [DOG_IMGS.black],
    foundAddress: "900 NE 125th St, North Miami, FL",
    processedAt: "North Miami Animal Care",
    diseases: ["Heartworm (treated)"],
    processedAgo: "2 months ago",
  },
  {
    label: "#0099",
    percent: 8,
    imgs: [DOG_IMGS.black],
    foundAddress: "3300 NW 27th Ave, Miami, FL 33142",
    processedAt: "Allapattah Pet Clinic",
    diseases: [],
    processedAgo: "5 weeks ago",
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
}));

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
          <View style={{ width: 36 }} />
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
                <Image
                  source={{ uri: item.uri }}
                  style={{ width: screenWidth, height: PHOTO_HEIGHT }}
                  resizeMode="cover"
                />
              )}
            />
            {hasMultiplePhotos && (
              <View style={styles.dotRow}>
                {entry.viewerPhotos.map((_, i) => (
                  <View
                    key={i}
                    style={[styles.dot, i === photoIndex && styles.dotActive]}
                  />
                ))}
              </View>
            )}
          </View>

          {/* Info content */}
          <View style={styles.infoContent}>
            {/* Match % badge */}
            <View
              style={[styles.matchBadge, { backgroundColor: color + "22" }]}
            >
              <Text style={[styles.matchBadgeText, { color }]}>
                {entry.percent}% Match
              </Text>
            </View>

            <InfoSection icon="location-outline" title="Found Location">
              <Text style={styles.infoText}>{entry.foundAddress}</Text>
            </InfoSection>

            <InfoSection icon="medical-outline" title="Processed At">
              <Text style={styles.infoText}>{entry.processedAt}</Text>
            </InfoSection>

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
    bottom: 12,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    gap: 6,
  },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.5)",
  },
  dotActive: {
    backgroundColor: Colors.white,
  },
  infoContent: {
    paddingVertical: 16,
  },
  matchBadge: {
    alignSelf: "flex-start",
    marginHorizontal: 16,
    marginBottom: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  matchBadgeText: {
    fontSize: 16,
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
