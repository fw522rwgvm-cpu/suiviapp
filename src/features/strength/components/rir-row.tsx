import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { RIR_CHOICES } from '../domain/session-set';
import { rirLabel } from '../domain/session-text';

/**
 * The RIR scale, on one line (specs 10.3).
 *
 * > RIR saisi via une rangée sur une ligne : 0 · 1 · 1,5 · 2 · 2,5 · 3 · 3,5 · 4+
 * > La saisie du RIR valide automatiquement la série.
 *
 * ## TAPPING ONE VALIDATES, SO THERE IS NO CONFIRM
 *
 * That is the specification, and it is also what makes the screen fast: the
 * last thing you know about a set is how many reps you had left, so saying it
 * IS finishing the set. A separate "valider" would be a second tap for a
 * decision already taken — the kind of gesture D16 says the fifteen-second
 * target is met by removing.
 *
 * Which also decides what this row must not do: no value is preselected and
 * none is a default. A row that opens on "2" would record a judgement nobody
 * made, on the one field of a set that is a judgement.
 *
 * ## EIGHT CELLS ON 390 POINTS, AND WHY THEY ARE NOT BUTTONS
 *
 * Eight is what the specification lists, and eight across a phone leaves about
 * forty points each — at the edge of Apple's 44, so the row is made TALLER
 * rather than narrower: the touch target is the full height, and the flex is
 * even so no value is harder to hit than its neighbours.
 *
 * Plain Pressables on the card, not GlassButtons: glass inside a card that is
 * itself content would be a material the direction reserves for chrome, and
 * eight of them side by side would be eight panes.
 */
export function RirRow({
  onPick,
  disabled,
}: {
  onPick: (rir: number) => void;
  disabled?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
      {RIR_CHOICES.map((rir) => (
        <Pressable
          key={rir}
          onPress={() => onPick(rir)}
          disabled={disabled === true}
          accessibilityRole="button"
          // Spelled out, because "4+" read aloud as "four plus" is the one
          // label whose meaning is not its number.
          accessibilityLabel={
            rir >= 4 ? 'RIR 4 ou plus, valide la série' : `RIR ${rirLabel(rir)}, valide la série`
          }
          style={({ pressed }) => [
            styles.cell,
            {
              backgroundColor: pressed ? theme.colors.accent : theme.colors.background,
              borderRadius: theme.radius.sm,
              opacity: disabled === true ? 0.4 : 1,
            },
          ]}
        >
          {({ pressed }) => (
            <Text
              style={[
                styles.label,
                { color: pressed ? theme.colors.onAccent : theme.colors.text },
              ]}
            >
              {rirLabel(rir)}
            </Text>
          )}
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 4, paddingHorizontal: 4, paddingBottom: 8 },
  cell: { flex: 1, minHeight: 44, alignItems: 'center', justifyContent: 'center' },
  label: { fontSize: 15, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
