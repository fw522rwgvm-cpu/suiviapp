import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { EQUIPMENT, MUSCLES, type Equipment, type Muscle } from '@/core/db/schema';
import { EQUIPMENT_LABELS, MUSCLE_LABELS } from '../domain/vocabulary';
import type { ExerciseFilter as Filter } from '../domain/exercise-search';

/**
 * The two filter strips above the exercise list (specs 10.1, "filtrage par
 * muscle et matériel").
 *
 * TagFilter's shape, twice, and its rules carry over unchanged:
 *
 *  - A CHIP NARROWS, THE FIELD SEARCHES, in that order. Typing "pectoraux" and
 *    tapping the Pectoraux chip are different questions, and a search that
 *    understood both would have to rank one against the other — a ranking with
 *    no defensible answer, which would make the list order unexplainable.
 *  - ONE AT A TIME, PER AXIS. Two chips selected within one strip immediately
 *    pose union or intersection, where every answer is invented and neither is
 *    visible from the chips themselves. Tapping the selected chip clears it.
 *  - A STRIP WITH NOTHING IN IT DOES NOT RENDER. A control with no content
 *    reads as broken, and fifteen muscle chips over a library of four exercises
 *    would be thirteen dead ends.
 *
 * ## WHAT IS NEW HERE: TWO AXES, AND WHY THAT DOES NOT REOPEN THE QUESTION
 *
 * Between two DIFFERENT axes the union/intersection question does not arise —
 * "pectoraux and haltères" has exactly one reading, and it is the intersection.
 * Which is precisely why each axis stays single-select: the ambiguity lives
 * inside an axis, never between two.
 *
 * The strips are ordered muscle then equipment, matching the row beneath them,
 * which reads "Pectoraux · Barre". A control and the thing it filters saying
 * the words in the same order is one less thing to work out.
 */
export function ExerciseFilterStrips({
  available,
  filter,
  onChange,
}: {
  /** The muscles and equipment the library actually holds. */
  available: { muscles: Set<string>; equipment: Set<string> };
  filter: Filter;
  onChange: (filter: Filter) => void;
}) {
  // Ordered by the vocabulary rather than by what is present, so the chips do
  // not reshuffle as the library grows.
  const muscles = MUSCLES.filter((muscle) => available.muscles.has(muscle));
  const equipment = EQUIPMENT.filter((item) => available.equipment.has(item));

  if (muscles.length === 0 && equipment.length === 0) return null;

  return (
    <View style={styles.strips}>
      <ChipStrip
        label="Muscle"
        options={muscles.map((value) => ({ value, label: MUSCLE_LABELS[value] }))}
        selected={filter.muscle}
        onSelect={(value) => onChange({ ...filter, muscle: asMuscle(value) })}
      />
      <ChipStrip
        label="Matériel"
        options={equipment.map((value) => ({ value, label: EQUIPMENT_LABELS[value] }))}
        selected={filter.equipment}
        onSelect={(value) => onChange({ ...filter, equipment: asEquipment(value) })}
      />
    </View>
  );
}

/**
 * Narrowed by looking the value up in the vocabulary rather than asserting it.
 *
 * The chips are built FROM MUSCLES, so the value coming back is always one of
 * them — but conventions section 4 refuses to type by assertion, and a lookup
 * costs nothing here. It also states the intent: a value the vocabulary does
 * not know clears the filter rather than setting an impossible one.
 */
function asMuscle(value: string | null): Muscle | null {
  return MUSCLES.find((muscle) => muscle === value) ?? null;
}

function asEquipment(value: string | null): Equipment | null {
  return EQUIPMENT.find((item) => item === value) ?? null;
}

function ChipStrip({
  label,
  options,
  selected,
  onSelect,
}: {
  label: string;
  options: readonly { value: string; label: string }[];
  selected: string | null;
  onSelect: (value: string | null) => void;
}) {
  const theme = useTheme();

  if (options.length === 0) return null;

  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.row}
      // A chip is a small target in a strip that scrolls sideways; without this
      // a tap that moves a pixel is eaten by the scroll view.
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={label}
    >
      {options.map((option) => {
        const active = option.value === selected;
        return (
          <Pressable
            key={option.value}
            onPress={() => onSelect(active ? null : option.value)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={`${label} : ${option.label}`}
            style={[
              styles.chip,
              {
                backgroundColor: active ? theme.colors.accent : theme.colors.surface,
                borderColor: active ? theme.colors.accent : theme.colors.border,
                borderRadius: theme.radius.sm,
              },
            ]}
          >
            <Text
              style={[
                styles.chipLabel,
                { color: active ? theme.colors.onAccent : theme.colors.text },
              ]}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  strips: { gap: 8 },
  row: { gap: 8, paddingRight: 4 },
  chip: { paddingVertical: 6, paddingHorizontal: 12, borderWidth: StyleSheet.hairlineWidth },
  chipLabel: { fontSize: 14, fontWeight: '500' },
});
