import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Colors } from '@/constants/colors';

export default function HomeScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Shrub</Text>
        <Text style={styles.headerSubtitle}>Stray Animal Hub</Text>
      </View>

      <View style={styles.content}>
        <Text style={styles.placeholder}>Recent sightings will appear here.</Text>
      </View>
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
    fontSize: 28,
    fontWeight: '700',
    color: Colors.textOnDark,
    letterSpacing: 0.5,
  },
  headerSubtitle: {
    fontSize: 14,
    color: Colors.accentLight,
    marginTop: 2,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  placeholder: {
    fontSize: 15,
    color: Colors.textSecondary,
    textAlign: 'center',
  },
});
