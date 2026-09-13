import Constants from 'expo-constants';
import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useStartupReport } from '@/core/db/database-gate';
import { useTheme } from '@/core/theme';
import { DataSection } from '@/features/backup/components/data-section';
import { SearchDiagnosticSection } from '../components/search-diagnostic-section';
import { SeedSection } from '../components/seed-section';
import { ListSeparator } from '@/core/ui/list-separator';

/**
 * The Reglages tab (specs 8.8, 12).
 *
 * Theme, day cutoff and the adherence tolerance arrive at slice 7. Nutrition
 * arrives here at slice 5, as specs 12 places it: day templates, the planning
 * and the default template. Données came with slice 2, and About because specs
 * 8.8 asks for the application and schema versions.
 *
 * The two Nutrition rows PUSH rather than present: browsing is a push, adding
 * is a modal, and these are places you go into. That is what the settings
 * group and its native stack exist for.
 */
export function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const report = useStartupReport();
  const config = Constants.expoConfig;

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.container}
    >
      {/* NativeTabs provides no JS header, so the screen carries its own title. */}
      <Text style={[styles.screenTitle, { color: theme.colors.text }]}>Réglages</Text>
      <Text style={[styles.lead, { color: theme.colors.textMuted }]}>
        Les autres réglages arriveront avec la fin de la V1 : thème, heure de bascule de la
        journée, tolérance d’adhérence.
      </Text>

      <Text style={[styles.section, { color: theme.colors.textFaint }]}>NUTRITION</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <LinkRow
          label="Modèles de journée"
          onPress={() => router.push('/(tabs)/settings/templates')}
        />
        <ListSeparator />
        <LinkRow
          label="Planning et modèle par défaut"
          onPress={() => router.push('/(tabs)/settings/planning')}
        />
      </View>

      {/* The safety net comes first among the rest: it is the only one there
          is (specs 5.4). */}
      <DataSection />

      <Text style={[styles.section, { color: theme.colors.textFaint }]}>À PROPOS</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Row label="Application" value={config?.name ?? 'inconnu'} />
        <ListSeparator />
        <Row label="Identifiant" value={config?.ios?.bundleIdentifier ?? 'inconnu'} />
        <ListSeparator />
        <Row label="Version" value={config?.version ?? 'inconnue'} />
        <ListSeparator />
        <Row label="Version de schéma" value={report.schema.lastTag ?? 'aucune'} />
        <ListSeparator />
        <Row label="Migrations appliquées" value={String(report.schema.migrationCount)} />
        <ListSeparator />
        <Row
          label="Sauvegarde avant migration"
          value={report.backup?.fileName ?? 'aucune (base neuve)'}
        />
        {report.interruptedImport ? (
          <>
            <ListSeparator />
            {/* The only trace the user gets that an import did not finish (D7). */}
            <Row label="Import interrompu" value="nettoyé au démarrage" />
          </>
        ) : null}
      </View>

      {/* Renders nothing on the daily installation (D15). */}
      <SearchDiagnosticSection />
      <SeedSection />
    </ScrollView>
  );
}

/** A row that goes somewhere, as against a row that states a fact. */
function LinkRow({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" style={styles.row}>
      <Text style={[styles.label, { color: theme.colors.text, fontSize: 17 }]}>{label}</Text>
      <SymbolView name="chevron.right" size={13} tintColor={theme.colors.textFaint} />
    </Pressable>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.colors.text }]} numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  // Generous bottom padding: the tab bar is translucent now, and content is
  // meant to scroll under it rather than stop short of it.
  container: { padding: 16, paddingTop: 24, paddingBottom: 48, gap: 8 },
  screenTitle: { fontSize: 34, fontWeight: '700', marginBottom: 4 },
  lead: { fontSize: 15, lineHeight: 22, marginBottom: 12 },
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginLeft: 4 },
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  label: { fontSize: 15 },
  value: { fontSize: 15, flexShrink: 1, textAlign: 'right' },
});
