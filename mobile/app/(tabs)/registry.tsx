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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { BlurView } from "expo-blur";
import { Ionicons } from "@expo/vector-icons";
import * as ImageManipulator from "expo-image-manipulator";
import { decode } from "jpeg-js";
import { Colors } from "@/constants/colors";

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
  processedAt: string;
  diseases: string[];
  processedAgo: string;
}

const RAW_DOGS = [
  {
    label: "#1847",
    imgs: [DOG_IMGS.d1, DOG_IMGS.d1, DOG_IMGS.d1],
    foundAddress: "2847 NW 7th Ave, Miami, FL 33127",
    processedAt: "City of Miami Animal Services",
    diseases: ["Ehrlichia (treated)", "Ringworm (cleared)"],
    processedAgo: "3 months ago",
  },
  {
    label: "#0392",
    imgs: [DOG_IMGS.d2],
    foundAddress: "1051 NW 2nd Ave, Hialeah, FL 33010",
    processedAt: "Hialeah Animal Shelter",
    diseases: [],
    processedAgo: "6 weeks ago",
  },
  {
    label: "#2201",
    imgs: [DOG_IMGS.d3],
    foundAddress: "500 SW 8th St, Miami, FL 33130",
    processedAt: "Doral Animal Clinic",
    diseases: ["Parvovirus (recovered)", "Mange (cleared)"],
    processedAgo: "5 months ago",
  },
  {
    label: "#0715",
    imgs: [DOG_IMGS.d4],
    foundAddress: "13400 SW 120th St, Miami, FL 33186",
    processedAt: "South Miami Shelter",
    diseases: [],
    processedAgo: "2 weeks ago",
  },
  {
    label: "#3388",
    imgs: [DOG_IMGS.black],
    foundAddress: "7800 SW 40th St, Miami, FL 33155",
    processedAt: "West Kendall Animal Hospital",
    diseases: ["Distemper (recovered)"],
    processedAgo: "4 months ago",
  },
  {
    label: "#1122",
    imgs: [DOG_IMGS.black],
    foundAddress: "4800 NW 183rd St, Miami Gardens, FL",
    processedAt: "Miami Gardens Rescue",
    diseases: [],
    processedAgo: "7 weeks ago",
  },
  {
    label: "#4456",
    imgs: [DOG_IMGS.black],
    foundAddress: "900 NE 125th St, North Miami, FL",
    processedAt: "North Miami Animal Care",
    diseases: ["Heartworm (treated)"],
    processedAgo: "2 months ago",
  },
  {
    label: "#0099",
    imgs: [DOG_IMGS.black],
    foundAddress: "3300 NW 27th Ave, Miami, FL 33142",
    processedAt: "Allapattah Pet Clinic",
    diseases: [],
    processedAgo: "5 weeks ago",
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
  processedAt: m.processedAt,
  diseases: m.diseases,
  processedAgo: m.processedAgo,
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

  return (
    <View style={[StyleSheet.absoluteFillObject, styles.profileRoot]}>
      <SafeAreaView style={styles.profileSafe} edges={["top", "bottom"]}>
        <View style={styles.profileHeader}>
          <TouchableOpacity onPress={onClose} style={styles.profileBackButton}>
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

          <View style={styles.infoContent}>
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

function DogCard({
  item,
  onPress,
}: {
  item: DogEntry;
  onPress: () => void;
}) {
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

  const filteredDogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return ALL_DOGS;
    return ALL_DOGS.filter((dog) =>
      dog.label.toLowerCase().includes(q),
    );
  }, [searchQuery]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.header}>
          <Text style={styles.headerTitle}>Registry</Text>
        </View>

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

        <Text style={styles.subtitle}>
          {filteredDogs.length} {filteredDogs.length === 1 ? "dog" : "dogs"}
        </Text>

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
              <DogCard item={item} onPress={() => setSelectedEntry(item)} />
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
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 4,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
    color: Colors.textPrimary,
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginTop: 8,
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
  subtitle: {
    fontSize: 13,
    color: Colors.textSecondary,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 12,
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
