import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';

/**
 * A segmented control: one of several, and never none.
 *
 * ## WHY IT LIVES HERE
 *
 * The rule is that a component migrates to core/ui at its SECOND real user.
 * This one arrives with two — the add window's list filter and the library's —
 * so it starts here rather than being moved later.
 *
 * It is DRAWN rather than native, for the reason UnitToggle already records:
 * React Native binds nothing to UISegmentedControl, and section 5 allows no
 * library that does. What is copied is its shape — a filled track, the chosen
 * one lifted out of it, every option the same size so nothing moves when the
 * choice changes.
 *
 * Known duplication, named rather than hidden: `unit-toggle.tsx` and
 * `yield-toggle.tsx` predate this and draw the same thing. They are left alone
 * — touching delivered code for consistency alone is what this project
 * declines — but whichever is next edited for its own reasons should fold into
 * this instead of being copied a fourth time.
 *
 * ## ALWAYS EXACTLY ONE
 *
 * `value` is not nullable and tapping the active option does nothing. That is
 * the difference from TagFilter, where tapping the active chip clears it: a tag
 * NARROWS a list that is meaningful without it, while this one SELECTS which
 * list is shown, and "no list" is not a state anyone asked for.
 */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  grow = false,
}: {
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  /**
   * Share the row equally between the options.
   *
   * True where the control IS the row — a filter under a search field, which
   * reads as a set of tabs. False inside a form row, where it is one answer
   * beside its question and must not push the label off the screen.
   */
  grow?: boolean;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: theme.colors.background }]}>
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <Pressable
            key={option.value}
            // Tapping the active option does nothing: there is no "none".
            onPress={() => {
              if (!chosen) onChange(option.value);
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen }}
            accessibilityLabel={option.label}
            style={[
              styles.option,
              grow ? styles.grow : styles.compact,
              chosen ? { backgroundColor: theme.colors.surface } : null,
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: chosen ? theme.colors.text : theme.colors.textMuted },
              ]}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  option: { paddingHorizontal: 12, paddingVertical: 6, alignItems: 'center', borderRadius: 7 },
  grow: { flex: 1 },
  // A floor rather than a share, so a two-option track does not breathe as the
  // choice moves between a short word and a long one.
  compact: { minWidth: 40 },
  label: { fontSize: 15, fontWeight: '500' },
});
