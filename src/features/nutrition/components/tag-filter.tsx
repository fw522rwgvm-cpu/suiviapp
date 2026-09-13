import { ScrollView, StyleSheet, Pressable } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';

/**
 * The tag chips above the recipe list (specs 8.6 "filtrage par tag").
 *
 * ## A SECOND FILTER, COMPOSED WITH THE SEARCH — NOT FOLDED INTO IT
 *
 * Typing "végétarien" into the search field and tapping the "végétarien" chip
 * are different questions, and a search that understood both would have to
 * rank one against the other. That ranking has no defensible answer: is a
 * recipe NAMED "gratin végétarien" a better match than one TAGGED végétarien?
 * Whatever it chose, the list order would stop being explainable.
 *
 * So the chip narrows and the field searches, in that order, and each stays a
 * pure function over the one cached list (D16, specs 8.4b).
 *
 * ## ONE TAG AT A TIME
 *
 * Not multi-select. Specs 8.6 says "filtrage par tag", singular, and two
 * selected chips immediately pose the question nobody has answered — union or
 * intersection — where every answer is invented and neither is visible from
 * the chips themselves. Tapping the selected chip clears it.
 *
 * The row disappears entirely when the library has no tags, rather than
 * showing an empty strip: a control with nothing in it reads as broken.
 */
export function TagFilter({
  tags,
  selected,
  onSelect,
}: {
  tags: readonly string[];
  selected: string | null;
  onSelect: (tag: string | null) => void;
}) {
  const theme = useTheme();

  if (tags.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      // A chip is a small target in a strip that scrolls sideways; without
      // this a tap that moves a pixel is eaten by the scroll view.
      keyboardShouldPersistTaps="handled"
    >
      {tags.map((tag) => {
        const active = tag === selected;
        return (
          <Pressable
            key={tag}
            // Tapping the active chip clears the filter. A separate "Tout"
            // chip would be a permanent control for an occasional act, and it
            // would sit where a tag could be.
            onPress={() => onSelect(active ? null : tag)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            style={({ pressed }) => [
              styles.chip,
              {
                backgroundColor: active
                  ? theme.colors.accent
                  : pressed
                    ? theme.colors.background
                    : theme.colors.surface,
                borderColor: active ? theme.colors.accent : theme.colors.border,
                borderRadius: theme.radius.lg,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                // White on a filled accent chip, the same single compromise
                // the green buttons already make everywhere else.
                { color: active ? '#ffffff' : theme.colors.text },
              ]}
              numberOfLines={1}
            >
              {tag}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  row: { gap: 8, paddingHorizontal: 2, paddingVertical: 2 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderWidth: StyleSheet.hairlineWidth,
  },
  label: { fontSize: 14 },
});
