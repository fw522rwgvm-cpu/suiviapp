import Constants from 'expo-constants';
import { SafeAreaView, StyleSheet, Text, View } from 'react-native';
import { useStartupReport } from '@/core/db/database-gate';

/**
 * Temporary screen. Its only purpose is to prove, on the device, which build
 * variant is installed, that the binary produced by CI launches, and that the
 * database opened and migrated. Removed once the four tabs land (step 9).
 */
export function BuildInfoScreen() {
  const config = Constants.expoConfig;
  const report = useStartupReport();

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <Text style={styles.title}>Socle</Text>

        <Row label="Application" value={config?.name ?? 'inconnu'} />
        <Row label="Identifiant" value={config?.ios?.bundleIdentifier ?? 'inconnu'} />
        <Row label="Version" value={config?.version ?? 'inconnue'} />

        <Text style={styles.section}>Base de données</Text>
        <Row label="État" value="ouverte et à jour" />
        <Row label="Migrations" value={String(report.schema.migrationCount)} />
        <Row label="Dernière migration" value={report.schema.lastTag ?? 'aucune'} />
        <Row
          label="Sauvegarde avant migration"
          value={report.backup?.fileName ?? 'aucune (base neuve)'}
        />
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
  section: { fontSize: 13, fontWeight: '600', color: '#6b6b6b', marginTop: 18 },
  row: { gap: 2 },
  label: { fontSize: 13, color: '#6b6b6b' },
  value: { fontSize: 17, color: '#111111' },
});
