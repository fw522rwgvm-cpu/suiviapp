import Constants from 'expo-constants';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { useStartupReport } from '@/core/db/database-gate';
import { useTheme } from '@/core/theme';

/**
 * The Reglages tab (specs 8.8, 12).
 *
 * Empty of settings: theme, day cutoff, templates, tolerance and export all
 * arrive at slice 7. It does carry the About section already, because specs 8.8
 * asks for the application and schema versions, and because the exit criterion
 * of slice 0 is that the application "opens its database" — which has to be
 * visible somewhere to be checked at all.
 */
export function SettingsScreen() {
  const theme = useTheme();
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
        Les réglages arriveront avec la fin de la V1 : thème, heure de bascule de la journée,
        modèles de journée, tolérance d’adhérence, export et import.
      </Text>

      <Text style={[styles.section, { color: theme.colors.textFaint }]}>À PROPOS</Text>
      <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
        <Row label="Application" value={config?.name ?? 'inconnu'} />
        <Separator />
        <Row label="Identifiant" value={config?.ios?.bundleIdentifier ?? 'inconnu'} />
        <Separator />
        <Row label="Version" value={config?.version ?? 'inconnue'} />
        <Separator />
        <Row label="Version de schéma" value={report.schema.lastTag ?? 'aucune'} />
        <Separator />
        <Row label="Migrations appliquées" value={String(report.schema.migrationCount)} />
        <Separator />
        <Row
          label="Sauvegarde avant migration"
          value={report.backup?.fileName ?? 'aucune (base neuve)'}
        />
      </View>
    </ScrollView>
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

function Separator() {
  const theme = useTheme();
  return <View style={[styles.separator, { backgroundColor: theme.colors.border }]} />;
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
  separator: { height: StyleSheet.hairlineWidth, marginLeft: 14 },
});
