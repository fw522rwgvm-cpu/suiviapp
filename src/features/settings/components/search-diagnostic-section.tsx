import Constants from 'expo-constants';
import { StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';
import { describeFoldSupport } from '@/features/nutrition/domain/food-search';

/**
 * Which accent-folding branch actually runs on this engine (dev variant only).
 *
 * WHY THIS NEEDS A SCREEN AT ALL, when a two-line test would seem to do.
 *
 * The answer cannot be reached any other way. Node always carries the Unicode
 * normalisation tables, so the suite always exercises the normalize branch --
 * leaving the branch that will run on the phone, if Hermes lacks them, as the
 * one part of the critical path no test has ever executed. And the obvious
 * check on the device is not a check: "creme" finds "Creme fraiche" WHICHEVER
 * branch ran, because the fallback table runs after NFD and covers the whole
 * of French on its own. A passing search proves nothing about which code path
 * produced it.
 *
 * It stopped being an idle question in slice 4. Open Food Facts is worldwide:
 * the table knows twenty-four Latin letters, and normalize knows every script
 * there is. If Hermes has no tables, the search still works for French and
 * silently stops folding everything else -- a degradation with no symptom,
 * which is the kind this project writes tests for.
 *
 * Rendered nowhere but the development installation, for the same reason as
 * the seed generator: two identifiers mean two containers (D1), and this is a
 * developer's instrument, not a setting.
 */
export function SearchDiagnosticSection() {
  const theme = useTheme();

  const variant = Constants.expoConfig?.extra?.['variant'];
  if (variant !== 'dev') return null;

  const support = describeFoldSupport();

  // The witness that identifies the branch: the table cannot produce 'pho',
  // so reading it means the engine decomposed.
  const branch = support.decomposes ? 'normalize (Unicode)' : 'table de repli (français)';

  return (
    <>
      <Text style={[styles.section, { color: theme.colors.textFaint }]}>
        RECHERCHE SANS ACCENT
      </Text>
      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        <Row label="Chemin actif" value={branch} />
        <ListSeparator />
        <Row label="normalize présent" value={support.present ? 'oui' : 'non'} />
        <ListSeparator />
        <Row label="décompose" value={support.decomposes ? 'oui' : 'non'} />
        {support.failure === null ? null : (
          <>
            <ListSeparator />
            <Row label="erreur" value={support.failure} />
          </>
        )}
        <ListSeparator />
        {/* Folds on both paths. A wrong answer here means the fold is broken. */}
        <Row label="Crème fraîche" value={support.french} />
        <ListSeparator />
        {/* Folds to 'pho' only when the engine decomposes. THE decisive line. */}
        <Row label="Phở" value={support.beyondFrench} />
        <ListSeparator />
        <Text style={[styles.note, { color: theme.colors.textMuted }]}>
          « creme fraiche » doit apparaître dans les deux cas. « pho » n’apparaît que si le
          moteur décompose ; sinon la recherche ne plie que le français, et les résultats
          Open Food Facts d’autres alphabets ne sont pas pliés.
        </Text>
      </View>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <Text style={[styles.value, { color: theme.colors.text }]} selectable>
        {value}
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
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, paddingVertical: 2 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  label: { fontSize: 15 },
  value: { fontSize: 15, fontWeight: '600', flexShrink: 1, textAlign: 'right' },
  note: { fontSize: 13, lineHeight: 18, paddingHorizontal: 14, paddingVertical: 11 },
});
