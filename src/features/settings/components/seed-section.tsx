import Constants from 'expo-constants';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { getAppDatabase } from '@/core/db/app-database';
import { useTheme } from '@/core/theme';
import { seedJournal } from '@/dev/seed';
import { resetDatabase } from '@/dev/reset';
import { useToday } from '../data/settings-queries';

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
  // Above the early return: hooks run unconditionally. On the production
  // variant this section renders nothing, and one settings read costs nothing.
  const today = useToday();
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
                endDate: today,
                days,
                // Varies from run to run on purpose: a fixed seed here would
                // write the same history twice over the same dates. Tests are
                // where the seed is pinned.
                seed: Date.now() % 100000,
              });
              // Each kind is named only when some were actually created:
              // pressing twice reuses the library rather than duplicating it,
              // and skips every date already weighed, so a second run
              // legitimately reports none of either.
              const parts = [`${report.entries} entrées sur ${report.days} journées`];
              if (report.recipes > 0) parts.push(`${report.recipes} recettes`);
              if (report.weights > 0) parts.push(`${report.weights} pesées`);
              setOutcome(`${parts.join(', ')}.`);
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

  /**
   * Empties the database (slice 11).
   *
   * ## THE CONFIRMATION NAMES WHAT GOES, AND IT IS EVERYTHING
   *
   * Specs 5.3 reserves the application's one warning for deleting an EXERCISE,
   * because that is the only deletion that destroys something irreplaceable.
   * This is a development-only button and a harder act than any of them — so it
   * asks, and it says "toutes les données" rather than a softer word. A
   * confirmation that understates what it prevents is the kind people learn to
   * tap through (specs 14.26 no 2).
   *
   * There is no undo and there is deliberately none: on the development
   * installation the data is invented, and the seed button above puts more back
   * in one tap.
   */
  function reset(): void {
    Alert.alert(
      'Vider la base ?',
      'Toutes les données de cette installation partent : journal, aliments, ' +
        'recettes, poids, exercices, routines, séances et réglages. Sans retour.',
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Vider',
          style: 'destructive',
          onPress: () => {
            setBusy(true);
            try {
              const report = resetDatabase(getAppDatabase());
              setOutcome(`Base vidée — ${report.tables} tables.`);
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
        {/*
          Separated from the three seed buttons by the note that explains it,
          rather than sitting as a fourth one in the same row: adding data and
          destroying all of it are not two sizes of the same action, and a
          destructive control beside three harmless ones is the misfire waiting
          to happen.
        */}
        <Text style={[styles.lead, { color: theme.colors.textMuted }]}>
          Repartir d’une base vide, sans réinstaller l’application.
        </Text>
        <Pressable
          onPress={reset}
          disabled={busy}
          accessibilityRole="button"
          style={[styles.button, { borderColor: theme.colors.danger }]}
        >
          <Text style={[styles.buttonLabel, { color: theme.colors.danger }]}>
            Vider la base
          </Text>
        </Pressable>
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
