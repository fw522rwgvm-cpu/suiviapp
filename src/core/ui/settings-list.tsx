import { SymbolView } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';
import { Text } from '@/core/ui/text';

/**
 * The grouped-inset idiom of the Settings, as shared pieces.
 *
 * ## WHY THESE MOVED OUT, AND WHEN
 *
 * They were private to settings-screen.tsx for two slices, which was right: one
 * screen used them. Splitting the Settings into a page per category gives them
 * six real users across two features — every settings sub-page, and the
 * notification screens. That is the rule this project applies to core/ui: a
 * component moves at its SECOND real user, not in anticipation of one.
 *
 * Copied out verbatim rather than redesigned. The spacing here matches
 * DataSection's, which was written first and which these pages sit beside; a
 * "tidy-up" on the way out would have made two groups on one page space
 * differently, which is exactly the kind of drift the move is supposed to end.
 */

/**
 * A caption and what it names, as siblings rather than a wrapper.
 *
 * A fragment, so the rows lay out in the page's own flex gap — which is what
 * makes these groups spaced exactly like DataSection's. Wrapping them in a View
 * would give the group its own inner spacing and leave it sitting differently
 * from its neighbour.
 */
export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <>
      <Text style={[styles.sectionTitle, { color: theme.colors.textFaint }]}>{title}</Text>
      {children}
    </>
  );
}

export function SettingsCard({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      {children}
    </View>
  );
}

export function SettingsNote({ children }: { children: ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.note, { color: theme.colors.textMuted }]}>{children}</Text>;
}

/**
 * One option of a closed set.
 *
 * A tick, and nothing where there is no tick: a column of empty circles would
 * draw seven controls where there is one choice. `first` rather than a
 * separator between siblings, so a caller can map without wrapping each row in
 * a fragment that carries its own rule.
 */
export function ChoiceRow({
  label,
  selected,
  first,
  onPress,
}: {
  label: string;
  selected: boolean;
  first?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View>
      {first === true ? null : <ListSeparator />}
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        style={styles.row}
      >
        <Text style={[styles.label, { color: theme.colors.text, fontSize: 17 }]}>{label}</Text>
        {selected ? (
          <SymbolView name="checkmark" size={15} tintColor={theme.colors.accent} />
        ) : null}
      </Pressable>
    </View>
  );
}

/**
 * A row that goes somewhere.
 *
 * `value` is what the row says about itself without being opened — the hour a
 * notification fires, the theme in force. It is what makes a page of links
 * worth having rather than a table of contents: the answer is on the row, and
 * the page behind it is for changing it.
 */
export function LinkRow({
  label,
  value,
  first,
  onPress,
}: {
  label: string;
  value?: string;
  first?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View>
      {first === true ? null : <ListSeparator />}
      <Pressable onPress={onPress} accessibilityRole="button" style={styles.row}>
        <Text style={[styles.label, { color: theme.colors.text, fontSize: 17 }]}>{label}</Text>
        <View style={styles.trailing}>
          {value === undefined ? null : (
            <Text style={[styles.value, { color: theme.colors.textMuted }]}>{value}</Text>
          )}
          <SymbolView name="chevron.right" size={13} tintColor={theme.colors.textFaint} />
        </View>
      </Pressable>
    </View>
  );
}

/**
 * The page every settings sub-page is.
 *
 * contentInsetAdjustmentBehavior "automatic" is the combination
 * react-native-screens expects under a transparent header: the content starts
 * BELOW the bar rather than behind it. The other arrangement in this project —
 * "never" plus a declared paddingTop — belongs to the day carousel alone,
 * which needs it because it calls scrollTo.
 */
export function SettingsPage({ children }: { children?: ReactNode }) {
  const theme = useTheme();
  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
      contentInsetAdjustmentBehavior="automatic"
    >
      {children}
    </ScrollView>
  );
}

export const settingsStyles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 14,
    // The system's own row height: below it a row stops being comfortable to
    // hit, above it a form starts to look like a list of cards.
    minHeight: 44,
    paddingVertical: 11,
  },
  label: { fontSize: 15 },
});

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48, gap: 8 },
  // marginTop, not a wrapper: it is the air ABOVE a group, and it has to match
  // DataSection's, which is written the same way.
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginLeft: 4,
    marginTop: 16,
  },
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: settingsStyles.row,
  label: settingsStyles.label,
  trailing: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  value: { fontSize: 17 },
  note: { fontSize: 13, lineHeight: 19, marginLeft: 4, marginRight: 4 },
});
