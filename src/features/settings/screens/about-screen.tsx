import Constants from 'expo-constants';
import { Stack } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useStartupReport } from '@/core/db/database-gate';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';

/**
 * About (specs 8.8, 12; section 7 calls it a screen).
 *
 * It was a section at the foot of the Settings screen for five slices. Slice 7
 * adds three groups above it — appearance, display, the adherence threshold —
 * and six rows of version numbers at the bottom of all that is six rows of
 * something nobody scrolls past anything to reach. Section 7 already called it
 * an écran; pushing it is what the settings stack exists for.
 *
 * ## WHAT IT IS FOR, WHICH IS NOT CURIOSITY
 *
 * The schema version and the migration count are how a refusal to start (D6/G3)
 * is diagnosed from the other side: the phone says "database newer than the
 * application", and this is where you read what the application actually
 * carries. The pre-migration backup's name is here for the same reason — it is
 * the file the blocking screen tells you to go and find.
 */
export function AboutScreen() {
  const theme = useTheme();
  const report = useStartupReport();
  const config = Constants.expoConfig;

  return (
    <>
      <Stack.Screen options={{ title: 'À propos' }} />

      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.container}
        // What the sibling pushed screens of this stack use, and what
        // react-native-screens pairs with a transparent header: the content
        // starts below the bar rather than behind it.
        contentInsetAdjustmentBehavior="automatic"
      >
        <View
          style={[
            styles.card,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
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

        {/*
          Specs 5.4 point 3 asks the Settings to say this explicitly. It is
          written now rather than with the exercises it concerns, because the
          sentence is about what the SAFETY NET covers, and that is a fact about
          the export the moment there is one.
        */}
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          L’export JSON couvre toutes les données de l’application. Les médias
          d’illustration des exercices, à partir de la V3, n’en feront pas partie : ce
          sont des fichiers, pas des données. Seule la copie manuelle du dossier les
          emporte.
        </Text>
      </ScrollView>
    </>
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
  // Generous bottom padding: the tab bar is translucent, and content is meant
  // to scroll under it rather than stop short of it.
  container: { padding: 16, paddingBottom: 48, gap: 16 },
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
  note: { fontSize: 13, lineHeight: 19 },
});
