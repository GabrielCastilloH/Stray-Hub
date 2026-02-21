import { useEffect, useState } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { Colors } from '@/constants/colors';

// Convert ISO 3166-1 alpha-2 country code to flag emoji
function countryCodeToFlag(code: string): string {
  return code
    .toUpperCase()
    .split('')
    .map(c => String.fromCodePoint(0x1f1e6 + c.charCodeAt(0) - 65))
    .join('');
}

// ─── Mock Data ────────────────────────────────────────────────────────────────

const STATS = [
  { label: 'Strays Logged', value: '2,847', icon: 'paw',              alert: false },
  { label: 'CNVR Coverage', value: '61%',   icon: 'shield-checkmark', alert: false },
];

const DISEASE_HOTSPOTS = [
  { id: '1', area: 'Barangay San Isidro', city: 'Quezon City', disease: 'Rabies',     severity: 'critical' as const, count: 12 },
  { id: '2', area: 'Tondo District',      city: 'Manila',      disease: 'Distemper',  severity: 'critical' as const, count: 8  },
  { id: '3', area: 'Bagong Silang',       city: 'Caloocan',    disease: 'Parvovirus', severity: 'high'     as const, count: 5  },
  { id: '4', area: 'Pasay Baclaran',      city: 'Pasay',       disease: 'Ehrlichia',  severity: 'medium'   as const, count: 3  },
];

const RECENT_ACTIVITY = [
  { id: '1', dogId: 'Dog #2847', action: 'Registered',     location: 'Tondo, Manila',    time: '12m ago', type: 'register' },
  { id: '2', dogId: 'Dog #2846', action: 'Vet Intake',     location: 'Brgy. San Isidro', time: '28m ago', type: 'vet'      },
  { id: '3', dogId: 'Dog #2845', action: 'CNVR: Neutered', location: 'Makati CBD',       time: '1h ago',  type: 'cnvr'     },
  { id: '4', dogId: 'Dog #2844', action: 'Disease Flagged',location: 'Tondo District',   time: '2h ago',  type: 'alert'    },
];

// ─── Config Maps ──────────────────────────────────────────────────────────────

const SEVERITY_CONFIG = {
  critical: { color: Colors.error,   bg: '#FEF0F0', label: 'Critical' },
  high:     { color: '#E07B00',       bg: '#FFF5E6', label: 'High'     },
  medium:   { color: Colors.warning, bg: '#FFFBE6', label: 'Medium'   },
};

const ACTIVITY_CONFIG = {
  register: { icon: 'paw'              as const, color: Colors.primary   },
  vet:      { icon: 'medkit'           as const, color: Colors.secondary },
  cnvr:     { icon: 'shield-checkmark' as const, color: Colors.accent    },
  alert:    { icon: 'alert-circle'     as const, color: Colors.error     },
};

// ─── Component ────────────────────────────────────────────────────────────────

export default function DashboardScreen() {
  const today = new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  const [countryCode, setCountryCode] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') return;
      const location = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low });
      const [place] = await Location.reverseGeocodeAsync({
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
      if (place?.isoCountryCode) setCountryCode(place.isoCountryCode);
    })();
  }, []);

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scroll}>

        {/* ── Header ── */}
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <Text style={styles.headerTitle}>Dashboard</Text>
            {countryCode && (
              <View style={styles.countryBadge}>
                <Text style={styles.countryFlag}>{countryCodeToFlag(countryCode)}</Text>
                <Text style={styles.countryCode}>{countryCode}</Text>
              </View>
            )}
          </View>
          <Text style={styles.headerDate}>{today}</Text>
        </View>

        {/* ── KPI Stats ── */}
        <View style={styles.statsGrid}>
          {STATS.map((stat, i) => (
            <View key={i} style={styles.statCard}>
              <View style={[styles.statIconBg, { backgroundColor: stat.alert ? '#FEF0F0' : Colors.accentSubtle }]}>
                <Ionicons name={stat.icon as any} size={18} color={stat.alert ? Colors.error : Colors.accent} />
              </View>
              <Text style={styles.statValue}>{stat.value}</Text>
              <Text style={styles.statLabel}>{stat.label}</Text>
            </View>
          ))}
        </View>

        {/* ── Disease Hotspots ── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Ionicons name="alert-circle" size={15} color={Colors.error} />
            <Text style={styles.sectionTitle}>Disease Hotspots</Text>
            <TouchableOpacity style={styles.showAllBtn}>
              <Text style={styles.showAllText}>Show all</Text>
            </TouchableOpacity>
          </View>

          {DISEASE_HOTSPOTS.slice(0, 2).map(spot => {
            const sev = SEVERITY_CONFIG[spot.severity];
            return (
              <View key={spot.id} style={styles.hotspotCard}>
                <View style={styles.hotspotBody}>
                  <Text style={styles.hotspotArea}>{spot.area}
                    <Text style={styles.hotspotCity}>, {spot.city}</Text>
                  </Text>
                  <View style={styles.hotspotMeta}>
                    <Text style={styles.diseaseName}>{spot.disease}</Text>
                    <Text style={styles.dot}>·</Text>
                    <Text style={styles.hotspotCount}>{spot.count} affected</Text>
                  </View>
                </View>
                <View style={[styles.severityBadge, { backgroundColor: sev.bg }]}>
                  <Text style={[styles.severityText, { color: sev.color }]}>{sev.label}</Text>
                </View>
              </View>
            );
          })}
        </View>

        {/* ── Recent Activity ── */}
        <View style={[styles.section, styles.lastSection]}>
          <View style={styles.sectionHeader}>
            <Ionicons name="time" size={15} color={Colors.primary} />
            <Text style={styles.sectionTitle}>Recent Activity</Text>
          </View>
          <View style={styles.activityCard}>
            {RECENT_ACTIVITY.map((item, i) => {
              const cfg = ACTIVITY_CONFIG[item.type as keyof typeof ACTIVITY_CONFIG];
              return (
                <View
                  key={item.id}
                  style={[styles.activityRow, i < RECENT_ACTIVITY.length - 1 && styles.activityRowBorder]}
                >
                  <View style={[styles.activityIconBg, { backgroundColor: cfg.color + '18' }]}>
                    <Ionicons name={cfg.icon} size={14} color={cfg.color} />
                  </View>
                  <View style={styles.activityInfo}>
                    <Text style={styles.activityDogId}>{item.dogId}</Text>
                    <Text style={styles.activityAction}>{item.action} · {item.location}</Text>
                  </View>
                  <Text style={styles.activityTime}>{item.time}</Text>
                </View>
              );
            })}
          </View>
        </View>

      </ScrollView>
    </SafeAreaView>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const cardShadow = {
  shadowColor: '#000',
  shadowOffset: { width: 0, height: 2 },
  shadowOpacity: 0.06,
  shadowRadius: 6,
  elevation: 2,
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  scroll: {
    paddingBottom: 24,
  },

  // Header
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  countryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.border,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  countryFlag: {
    fontSize: 16,
    lineHeight: 20,
  },
  countryCode: {
    fontSize: 12,
    fontWeight: '600',
    color: Colors.textSecondary,
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 26,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  headerDate: {
    fontSize: 13,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Stats grid
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 10,
  },
  statCard: {
    width: '47.5%',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    padding: 14,
    ...cardShadow,
  },
  statIconBg: {
    width: 34,
    height: 34,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  statValue: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textPrimary,
  },
  statLabel: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 2,
  },

  // Section shell
  section: {
    marginTop: 24,
    paddingHorizontal: 16,
  },
  lastSection: {
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '700',
    color: Colors.textPrimary,
    flex: 1,
  },
  showAllBtn: {
    paddingHorizontal: 4,
    paddingVertical: 4,
  },
  showAllText: {
    fontSize: 12,
    fontWeight: '500',
    color: Colors.textSecondary,
  },

  // Disease hotspot rows
  hotspotCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    marginBottom: 8,
    overflow: 'hidden',
    ...cardShadow,
  },
  hotspotAccent: {
    width: 4,
    alignSelf: 'stretch',
  },
  hotspotBody: {
    flex: 1,
    paddingVertical: 12,
    paddingLeft: 14,
    paddingRight: 8,
  },
  hotspotArea: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.textPrimary,
    marginBottom: 3,
  },
  hotspotCity: {
    fontSize: 14,
    fontWeight: '400',
    color: Colors.textSecondary,
  },
  hotspotMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  diseaseName: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  dot: {
    fontSize: 12,
    color: Colors.textDisabled,
  },
  hotspotCount: {
    fontSize: 12,
    color: Colors.textSecondary,
  },
  severityBadge: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 6,
    marginRight: 12,
  },
  severityText: {
    fontSize: 11,
    fontWeight: '600',
  },

  // Recent activity feed
  activityCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    ...cardShadow,
  },
  activityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    gap: 10,
  },
  activityRowBorder: {
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  activityIconBg: {
    width: 32,
    height: 32,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  activityInfo: {
    flex: 1,
  },
  activityDogId: {
    fontSize: 13,
    fontWeight: '600',
    color: Colors.textPrimary,
  },
  activityAction: {
    fontSize: 12,
    color: Colors.textSecondary,
    marginTop: 1,
  },
  activityTime: {
    fontSize: 11,
    color: Colors.textDisabled,
  },
});
