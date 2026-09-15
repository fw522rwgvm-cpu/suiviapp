import { Pressable, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import type { RoutineListItem } from '../data/routine-reads';

/**
 * One routine in the list (specs 10.2).
 *
 * > une ligne par routine avec démarrage direct, bouton de création, accès à
 * > la page
 *
 * THE START BUTTON IS NOT HERE, and that is slice 11's, not an omission: there
 * is no session to start. A button that did nothing would be worse than its
 * absence, and one that navigated to a screen explaining that sessions arrive
 * later would be worse still. The row's press opens the page, which is the
 * other half of the same sentence.
 *
 * The second line counts, because a count is what distinguishes two routines
 * whose names look alike at a glance — "4 exercices · 12 séries" says more
 * about what a session will be than any name does.
 */
export function RoutineRow({
  routine,
  onPress,
}: {
  routine: RoutineListItem;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${routine.name}, ${summary(routine)}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.background : theme.colors.surface },
      ]}
    >
      <View style={styles.identity}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {routine.name}
        </Text>
        <Text style={[styles.summary, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {summary(routine)}
        </Text>
      </View>
      <SymbolView name="chevron.right" size={13} tintColor={theme.colors.textMuted} />
    </Pressable>
  );
}

/**
 * "4 exercices · 12 séries", agreeing in number.
 *
 * An empty routine says so rather than reading "0 exercices · 0 séries". The
 * editor refuses to save one, so this only shows for a row that arrived in an
 * archive — and a list that quietly dropped it would be worse than one that
 * shows something to fix.
 */
export function summary(routine: RoutineListItem): string {
  if (routine.setCount === 0) return 'Aucune série';

  const exercises =
    routine.exerciseCount === 1 ? '1 exercice' : `${routine.exerciseCount} exercices`;
  const sets = routine.setCount === 1 ? '1 série' : `${routine.setCount} séries`;
  return `${exercises} · ${sets}`;
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    paddingHorizontal: 14,
    minHeight: 58,
  },
  identity: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '500' },
  summary: { fontSize: 13 },
});
