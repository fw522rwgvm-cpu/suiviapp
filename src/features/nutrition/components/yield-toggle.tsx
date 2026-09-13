import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { YIELD_TYPES, type YieldType } from '@/core/db/schema';

/**
 * Portions or total weight, for a recipe's yield (specs 6.1, 8.6).
 *
 * > Rendement en portions ou en poids total, ce dernier saisi manuellement.
 *
 * UnitToggle's twin, drawn the same way and for the same reason: React Native
 * binds nothing to UISegmentedControl and section 5 allows no library that
 * does, so what is copied is the shape — a filled track, the chosen one lifted
 * out of it, both halves the same size so neither moves when the choice
 * changes.
 *
 * Unlike the unit toggle, switching here converts nothing either, but for a
 * different reason: four portions and 850 g are not the same fact in two
 * units, they are two different statements about the dish. The number beside
 * the toggle is retyped, not converted — and a weight yield is always grams,
 * so no unit control appears next to it.
 *
 * The two options come from YIELD_TYPES rather than being spelled here, so the
 * control and the CHECK constraint cannot drift apart.
 */
const LABELS: Record<YieldType, string> = {
  portions: 'Portions',
  weight: 'Poids total',
};

export function YieldToggle({
  yieldType,
  onChange,
}: {
  yieldType: YieldType;
  onChange: (yieldType: YieldType) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: theme.colors.background }]}>
      {YIELD_TYPES.map((candidate) => {
        const chosen = candidate === yieldType;
        return (
          <Pressable
            key={candidate}
            onPress={() => onChange(candidate)}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen }}
            accessibilityLabel={LABELS[candidate]}
            style={[styles.option, chosen ? { backgroundColor: theme.colors.surface } : null]}
          >
            <Text
              style={[
                styles.label,
                { color: chosen ? theme.colors.text : theme.colors.textMuted },
              ]}
            >
              {LABELS[candidate]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  option: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    alignItems: 'center',
    borderRadius: 7,
  },
  label: { fontSize: 15, fontWeight: '500' },
});
