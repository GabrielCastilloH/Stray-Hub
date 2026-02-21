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

type LocationSource = "my" | "custom";
type SortOrder = "closest" | "furthest";

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
  sortOrder,
  setSortOrder,
  isLoadingLocation,
  locationError,
  currentAddressPreview,
}: {
  visible: boolean;
  onClose: () => void;
  onApply: (opts: {
    lat: number;
    lon: number;
    sortOrder: SortOrder;
  }) => void;
  onClear: () => void;
  locationSource: LocationSource;
  setLocationSource: (s: LocationSource) => void;
  customAddress: string;
  setCustomAddress: (s: string) => void;
  sortOrder: SortOrder;
  setSortOrder: (s: SortOrder) => void;
  isLoadingLocation: boolean;
  locationError: string | null;
  currentAddressPreview: string | null;
}) {
  const [isGeocoding, setIsGeocoding] = useState(false);
  const [geocodeError, setGeocodeError] = useState<string | null>(null);

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
          sortOrder,
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
        onApply({ lat: coords.lat, lon: coords.lon, sortOrder });
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
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <TouchableOpacity
          style={StyleSheet.absoluteFill}
          activeOpacity={1}
          onPress={onClose}
        />
        <View style={styles.modalContent}>
          <View style={styles.modalHandle} />
          <Text style={styles.modalTitle}>Sort by distance</Text>

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

          <Text style={[styles.filterSectionLabel, { marginTop: 16 }]}>Sort order</Text>
          <View style={styles.sortOrderRow}>
            <TouchableOpacity
              style={[styles.sortPill, sortOrder === "closest" && styles.sortPillActive]}
              onPress={() => setSortOrder("closest")}
            >
              <Text
                style={[
                  styles.sortPillText,
                  sortOrder === "closest" && styles.sortPillTextActive,
                ]}
              >
                Closest first
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.sortPill, sortOrder === "furthest" && styles.sortPillActive]}
              onPress={() => setSortOrder("furthest")}
            >
              <Text
                style={[
                  styles.sortPillText,
                  sortOrder === "furthest" && styles.sortPillTextActive,
                ]}
              >
                Furthest first
              </Text>
            </TouchableOpacity>
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
        </View>
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
  const [sortOrder, setSortOrder] = useState<SortOrder>("closest");
  const [referenceLocation, setReferenceLocation] = useState<{
    lat: number;
    lon: number;
    sortOrder: SortOrder;
  } | null>(null);

  const filteredDogs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    let list = !q ? ALL_DOGS : ALL_DOGS.filter((d) => d.label.toLowerCase().includes(q));

    if (referenceLocation) {
      const { lat, lon, sortOrder: order } = referenceLocation;
      const withDistance = list.map((dog) => ({
        dog,
        distance: getDistanceKm(dog.latitude, dog.longitude, lat, lon),
      }));
      withDistance.sort((a, b) =>
        order === "closest" ? a.distance - b.distance : b.distance - a.distance
      );
      return withDistance.map(({ dog, distance }) => ({ ...dog, _distanceKm: distance }));
    }
    return list.map((d) => ({ ...d, _distanceKm: undefined as number | undefined }));
  }, [searchQuery, referenceLocation]);

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={["top", "bottom"]}>
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
            sortOrder: opts.sortOrder,
          })
        }
        onClear={() => setReferenceLocation(null)}
        locationSource={locationSource}
        setLocationSource={setLocationSource}
        customAddress={customAddress}
        setCustomAddress={setCustomAddress}
        sortOrder={sortOrder}
        setSortOrder={setSortOrder}
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
