import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/colors';

interface SettingsRow {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  onPress?: () => void;
}

const SETTINGS_ROWS: SettingsRow[] = [
  { label: 'Account', icon: 'person-outline' },
  { label: 'Notifications', icon: 'notifications-outline' },
  { label: 'Privacy', icon: 'lock-closed-outline' },
  { label: 'About', icon: 'information-circle-outline' },
];

export default function SettingsScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.list}>
        {SETTINGS_ROWS.map((row, index) => (
          <TouchableOpacity
            key={row.label}
            style={[styles.row, index === SETTINGS_ROWS.length - 1 && styles.rowLast]}
            activeOpacity={0.6}
            onPress={row.onPress}
          >
            <Ionicons name={row.icon} size={20} color={Colors.secondary} style={styles.rowIcon} />
            <Text style={styles.rowLabel}>{row.label}</Text>
            <Ionicons name="chevron-forward" size={16} color={Colors.textDisabled} />
          </TouchableOpacity>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.background,
  },
  header: {
    backgroundColor: Colors.primary,
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: Colors.textOnDark,
  },
  list: {
    margin: 16,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.border,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: Colors.border,
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowIcon: {
    marginRight: 12,
  },
  rowLabel: {
    flex: 1,
    fontSize: 15,
    color: Colors.textPrimary,
  },
});
