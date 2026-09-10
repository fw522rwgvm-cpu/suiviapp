import Constants from 'expo-constants';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';

/**
 * Temporary screen. Its only purpose is to prove, on the device, which build
 * variant is installed and that the binary produced by CI actually launches.
 * Removed once the four tabs land (step 9 of slice 0).
 */
export function BuildInfoScreen() {
  const config = Constants.expoConfig;
  const bundleId = config?.ios?.bundleIdentifier ?? 'inconnu';

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Socle</Text>
        <Row label="Application" value={config?.name ?? 'inconnu'} />
        <Row label="Identifiant" value={bundleId} />
        <Row label="Version" value={config?.version ?? 'inconnue'} />
      </View>
    </SafeAreaView>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.row}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.value}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#ffffff' },
  container: { flex: 1, justifyContent: 'center', paddingHorizontal: 24, gap: 12 },
  title: { fontSize: 28, fontWeight: '600', marginBottom: 12, color: '#111111' },
  row: { gap: 2 },
  label: { fontSize: 13, color: '#6b6b6b' },
  value: { fontSize: 17, color: '#111111' },
});
