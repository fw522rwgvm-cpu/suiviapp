import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/core/theme';
import type { BaseUnit } from '@/core/db/schema';

/**
 * Grams or millilitres, for a food and for a portion of one.
 *
 * WATERTIGHT, AND THAT IS THE POINT (specs 5.1). Tapping the other one
 * converts nothing and never can: there is no density anywhere in this
 * application, so 100 g is not 100 ml and the two are never the same figure
 * seen twice. It says what the numbers beside it are counted in, and a food
 * whose unit is wrong is corrected by retyping them.
 *
 * Drawn rather than native: React Native binds nothing to UISegmentedControl,
 * and section 5 allows no library that does. What is copied is its shape --
 * a filled track, the chosen one lifted out of it, both halves the same size
 * so neither moves when the choice changes.
 */
export function UnitToggle({
  unit,
  onChange,
}: {
  unit: BaseUnit;
  onChange: (unit: BaseUnit) => void;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.track, { backgroundColor: theme.colors.background }]}>
      {(['g', 'ml'] as BaseUnit[]).map((candidate) => {
        const chosen = candidate === unit;
        return (
          <Pressable
            key={candidate}
            onPress={() => onChange(candidate)}
            accessibilityRole="button"
            accessibilityState={{ selected: chosen }}
            accessibilityLabel={candidate === 'g' ? 'Grammes' : 'Millilitres'}
            style={[
              styles.option,
              chosen ? { backgroundColor: theme.colors.surface } : null,
            ]}
          >
            <Text
              style={[
                styles.label,
                { color: chosen ? theme.colors.text : theme.colors.textMuted },
              ]}
            >
              {candidate}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  track: { flexDirection: 'row', borderRadius: 9, padding: 2 },
  // Both the same width, so the track does not breathe as the choice moves.
  option: { width: 40, paddingVertical: 5, alignItems: 'center', borderRadius: 7 },
  label: { fontSize: 15, fontWeight: '500' },
});
