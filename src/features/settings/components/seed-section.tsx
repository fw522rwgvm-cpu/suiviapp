import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { currentLocalDate } from '@/core/date';
import { getAppDatabase } from '@/core/db/app-database';
import { useTheme } from '@/core/theme';
import { seedJournal } from '@/dev/seed';

/**
 * Demo data, on the development installation only (D15).
 *
 * The generator is worth reaching from the application itself: it is the only
 * way to find out whether the Journal still reads well with three months
 * behind it, on the actual phone, at the actual size.
 *
 * It renders nothing at all on the production variant. Two identifiers means
 * two containers (D1), and the daily one holds real data: a seed button there
 * would be a way to pour invented history into it. The guard is the variant,
 * read from the Expo config, which is the single source of truth for which
 * installation this binary is.
 */

const HORIZONS = [
  { label: '30 jours', days: 30 },
  { label: '90 jours', days: 90 },
  { label: '1 an', days: 365 },
] as const;

export function SeedSection() {
  const theme = useTheme();
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<string | null>(null);

  const variant = Constants.expoConfig?.extra?.['variant'];
  if (variant !== 'dev') return null;

  function generate(days: number, label: string): void {
    Alert.alert(
      `Générer ${label} ?`,
      'Des entrées inventées seront ajoutées aux journées de cette période. Rien n’est effacé.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Générer',
          onPress: () => {
            setBusy(true);
            try {
              const report = seedJournal(getAppDatabase(), {
                endDate: currentLocalDate(),
                days,
                // Varies from run to run on purpose: a fixed seed here would
                // write the same history twice over the same dates. Tests are
                // where the seed is pinned.
                seed: Date.now() % 100000,
              });
              setOutcome(`${report.entries} entrées sur ${report.days} journées.`);
            } catch (error) {
              setOutcome(error instanceof Error ? error.message : String(error));
            } finally {
              setBusy(false);
            }
          },
        },
      ],
    );
  }

  return (
    <>
      <Text style={[styles.section, { color: theme.colors.textFaint }]}>
        DÉVELOPPEMENT
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Text style={[styles.lead, { color: theme.colors.textMuted }]}>
          Jeu de données de démonstration. Uniquement sur l’installation de développement.
        </Text>
        <View style={styles.buttons}>
          {HORIZONS.map((horizon) => (
            <Pressable
              key={horizon.days}
              onPress={() => generate(horizon.days, horizon.label)}
              disabled={busy}
              accessibilityRole="button"
              style={[styles.button, { borderColor: theme.colors.border }]}
            >
              <Text style={[styles.buttonLabel, { color: theme.colors.accent }]}>
                {horizon.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {outcome === null ? null : (
          <Text style={[styles.outcome, { color: theme.colors.textMuted }]}>{outcome}</Text>
        )}
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  section: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginLeft: 4, marginTop: 16 },
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, padding: 14, gap: 12 },
  lead: { fontSize: 14, lineHeight: 20 },
  buttons: { flexDirection: 'row', gap: 8 },
  button: {
    flex: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
    paddingVertical: 10,
    alignItems: 'center',
  },
  buttonLabel: { fontSize: 15, fontWeight: '600' },
  outcome: { fontSize: 13 },
});
