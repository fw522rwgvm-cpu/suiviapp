import Constants from 'expo-constants';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';
import { BUDGETS_MS, readMeasurements, type Reading } from '@/core/perf/marks';

/**
 * The four critical transitions, measured (D16, dev variant only).
 *
 * > Instrumentation en développement des quatre transitions du parcours
 * > critique. Sans mesure, une cible de performance n'est qu'un vœu.
 *
 * ## WHY IT HAS TO BE A SCREEN, AND CANNOT BE A TEST
 *
 * Every figure here is about a phone: what Hermes does with the bundle, how
 * long a UIKit presentation takes, what SQLite costs on that flash. Node can
 * measure none of it, and the simulator that could measure some of it needs a
 * Mac (D15: "ce n'est pas un arbitrage, c'est une impossibilité"). So the
 * instrument goes where the code runs, which is the same argument the
 * accent-folding diagnostic makes one section above.
 *
 * ## IT DOES NOT REFRESH ITSELF
 *
 * A tap re-reads. A live view would have to subscribe, which means state on
 * the critical path, which is the one thing measuring it must not add. And the
 * figures cannot change while this screen is up: every transition it times
 * happens somewhere else.
 *
 * Rendered nowhere but the development installation, like the seed generator:
 * two identifiers mean two containers (D1), and this is an instrument rather
 * than a setting.
 */
export function PerfSection() {
  const theme = useTheme();
  const [readings, setReadings] = useState<Reading[]>(readMeasurements);

  const variant = Constants.expoConfig?.extra?.['variant'];
  if (variant !== 'dev') return null;

  return (
    <>
      <Text style={[styles.section, { color: theme.colors.textFaint }]}>
        PARCOURS CRITIQUE (D16)
      </Text>

      <Pressable
        onPress={() => setReadings(readMeasurements())}
        accessibilityRole="button"
        accessibilityLabel="Relire les mesures"
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        {readings.map((reading, index) => (
          <View key={reading.name}>
            {index === 0 ? null : <ListSeparator />}
            <Row reading={reading} />
          </View>
        ))}
      </Pressable>

      <Text style={[styles.note, { color: theme.colors.textFaint }]}>
        Dernière mesure, puis la pire vue depuis le lancement. Le démarrage est
        compté depuis l’évaluation du bundle : ce qui se passe avant — le processus,
        le runtime, Hermes — est hors de portée du JavaScript, donc le chiffre est
        un minorant. Toucher la carte relit.
      </Text>
    </>
  );
}

function Row({ reading }: { reading: Reading }) {
  const theme = useTheme();
  const budget = BUDGETS_MS[reading.name];

  // Over budget is worth seeing at a glance; under it says nothing and gets no
  // colour. The danger token is the one this application reserves for "this is
  // a problem", and a measurement past its budget is exactly that.
  const colour =
    reading.last === null
      ? theme.colors.textFaint
      : reading.last.ms > budget
        ? theme.colors.danger
        : theme.colors.text;

  return (
    <View style={styles.row}>
      <View style={styles.labels}>
        <Text style={[styles.label, { color: theme.colors.text }]}>{reading.name}</Text>
        <Text style={[styles.budget, { color: theme.colors.textFaint }]}>
          budget {budget} ms
          {reading.worst === null ? '' : ` · pire ${reading.worst.ms} ms`}
        </Text>
      </View>
      <Text style={[styles.value, { color: colour }]}>
        {reading.last === null ? '—' : `${reading.last.ms} ms`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginLeft: 4,
    marginTop: 16,
  },
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  labels: { flex: 1, gap: 2 },
  label: { fontSize: 15 },
  budget: { fontSize: 12 },
  // Tabular so four figures read as a column rather than as four sentences.
  value: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  note: { fontSize: 12, lineHeight: 17, marginLeft: 4, marginRight: 4 },
});
