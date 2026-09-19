import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { RIR_CHOICES } from '../domain/session-set';
import { rirLabel } from '../domain/session-text';

/**
 * The eight RIR values, in a small window over the page (specs 14.38).
 *
 * ## WHY IT LEFT THE ROW
 *
 * Slice 11 put them in a strip UNDER the set being done, and that strip was
 * also the validation: tapping a number completed the set. Two things in one
 * control, and it made the second unreachable — no way to change a RIR you had
 * just mis-tapped, no way to say it before doing the set. Requested split into
 * a column and a button; the eight values had to go somewhere, and a strip that
 * pushes every row below it down is the thing a window exists to avoid.
 *
 * ## A `Modal`, NOT `OverlayPanel` AND NOT AN ACTION SHEET
 *
 * `OverlayPanel` is the window this application opens over the DAY, and it is a
 * route — it belongs to things you navigate to and come back from. This is a
 * value picker that lives and dies inside one press, so a route would put an
 * entry in the history for choosing a number.
 *
 * An `ActionSheetIOS` was the other candidate and is wrong for the shape: eight
 * options plus a cancel is a full-height sheet for a choice between eight
 * two-character labels, and the request said a SMALL window.
 *
 * `Modal` is core React Native, so nothing enters section 5.
 *
 * ## THE BACKDROP DISMISSES, AND THERE IS NO CANCEL BUTTON
 *
 * Nothing is being committed: the window shows a value that already exists and
 * replaces it if you pick another. A cancel would be a third control for an
 * action that is already reversible by picking again.
 *
 * ## THE CURRENT VALUE IS MARKED
 *
 * Which is the reason this can be reopened at all. A picker that does not say
 * what is already chosen makes you tap one to find out, and tapping one is the
 * thing that changes it.
 */
export function RirPicker({
  visible,
  current,
  onPick,
  onDismiss,
}: {
  visible: boolean;
  /** What the set carries now — its own, or the target it inherits. */
  current: number | null;
  onPick: (rir: number) => void;
  onDismiss: () => void;
}) {
  const theme = useTheme();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onDismiss}
      // The window is over the session, which is a pushed screen: without this
      // iOS presents it over the whole application and the status bar jumps.
      supportedOrientations={['portrait']}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Fermer"
      >
        {/*
          A Pressable inside a Pressable, on purpose: the inner one swallows the
          press so tapping the card does not dismiss it. It has no onPress of
          its own, which is what makes it a shield rather than a control.
        */}
        <Pressable
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
            theme.shadow,
          ]}
        >
          <Text style={[styles.title, { color: theme.colors.text }]}>RIR ressenti</Text>
          <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
            Répétitions qu’il restait en réserve.
          </Text>

          <View style={styles.grid}>
            {RIR_CHOICES.map((rir) => {
              const chosen = current === rir;
              return (
                <Pressable
                  key={rir}
                  onPress={() => onPick(rir)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: chosen }}
                  // Spelled out, because "4+" read aloud as "four plus" is the
                  // one label whose meaning is not its number.
                  accessibilityLabel={rir >= 4 ? 'RIR 4 ou plus' : `RIR ${rirLabel(rir)}`}
                  style={({ pressed }) => [
                    styles.cell,
                    {
                      backgroundColor: chosen
                        ? theme.colors.accent
                        : pressed
                          ? theme.colors.background
                          : theme.colors.background,
                      borderColor: chosen ? theme.colors.accent : theme.colors.border,
                      borderRadius: theme.radius.md,
                      opacity: pressed && !chosen ? 0.6 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.label,
                      { color: chosen ? theme.colors.onAccent : theme.colors.text },
                    ]}
                  >
                    {rirLabel(rir)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    // Dark rather than a theme token: it is over a page, not part of one, and
    // it must read as a scrim in both themes.
    backgroundColor: 'rgba(0, 0, 0, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  card: { width: '100%', maxWidth: 340, borderWidth: StyleSheet.hairlineWidth, padding: 16, gap: 4 },
  title: { fontSize: 17, fontWeight: '600' },
  hint: { fontSize: 13, paddingBottom: 10 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  cell: {
    // Four to a row on a 340-point card, and 44 high: Apple's minimum, which is
    // also why they did not fit on a table row.
    minWidth: 68,
    flexGrow: 1,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
});
