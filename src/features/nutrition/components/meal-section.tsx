import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatKcal, formatMacroWhole } from '@/core/format';
import { useTheme } from '@/core/theme';
import { useMealEntries } from '../data/day-queries';
import type { JournalEntryView } from '../data/day-reads';
import type { DayMealView } from '../domain/day-plan';
import { progressRatio, targetStanding, ZERO_MACROS, type Macros } from '../domain/macros';
import { EntryRow } from './entry-row';
import { mealColor, mealSymbol } from './meal-symbol';
import { ProgressRing } from './progress-ring';
import { RecipeBlockRow } from './recipe-block-row';
import { SwipeToDeleteRow } from './swipe-to-delete-row';
import { ListSeparator } from '@/core/ui/list-separator';

/**
 * One meal of the day: header, sub-total, and its entries once unfolded.
 *
 * > Meals collapsed by default, with a sub-total and a target of their own.
 *
 * Collapsed is not only a reading preference, it is a performance rule (D16):
 * nothing heavy at launch. The sub-total comes from a single grouped query
 * over the whole day, so showing it costs no entry load, and the entries of a
 * meal are fetched only when that meal is opened.
 *
 * A virtual meal has no identifier and therefore no entries to fetch — the
 * query stays disabled until the day is materialised.
 */
export function MealSection({
  meal,
  total,
  onAdd,
  onEditEntry,
  onDeleteEntry,
  onLongPress,
}: {
  meal: DayMealView;
  total: Macros | undefined;
  onAdd: () => void;
  onEditEntry: (entry: JournalEntryView) => void;
  onDeleteEntry: (entry: JournalEntryView) => void;
  onLongPress: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);
  const entries = useMealEntries(open ? meal.id : null);

  const consumed = total ?? ZERO_MACROS;
  const consumedKcal = consumed.kcal;
  const targetKcal = meal.targets?.kcal ?? null;

  /**
   * THE ICON IS ALWAYS THERE; THE RING IS NOT.
   *
   * The glyph says which meal this is and is true whether or not anyone set a
   * goal, so it stays. The ring is a proportion, and a proportion of nothing is
   * not a ring at zero — it is a shape that looks broken, and a day with no
   * template would stack four of them. So a meal with no target keeps its icon
   * and loses its circle, which is exactly what was asked for and also what
   * every day logged before 0004 will look like for ever.
   *
   * The macro band follows the ring, for the same reason: three bars with no
   * denominator are three bars that cannot be read.
   */
  const standing = targetStanding(consumedKcal, targetKcal);
  const ringColor = standing === 'beyond' ? theme.colors.danger : theme.colors.accent;

  return (
    <View
      style={[
        styles.container,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        },
        theme.shadow,
      ]}
    >
      <View style={styles.headerRow}>
        <Pressable
          onPress={() => setOpen((current) => !current)}
          onLongPress={onLongPress}
          accessibilityRole="button"
          accessibilityState={{ expanded: open }}
          style={styles.headerPress}
        >
          {/*
            The chevron leads, because it is what the whole row does: it says
            "this opens" before you have read what opens. Trailing, it read as
            an afterthought on a row whose main target is the name.
          */}
          <SymbolView
            name={open ? 'chevron.down' : 'chevron.right'}
            size={13}
            tintColor={theme.colors.textFaint}
          />

          {/*
            Same rule as the day's ring, because it answers the same question
            one level down: the ordinary colour until the margin is passed. It
            carries the icon rather than a figure — the kcal are
            written out an inch to its right, and repeating them would be
            saying one fact twice.
          */}
          {targetKcal === null ? (
            <View style={styles.iconAlone}>
              <SymbolView
                name={mealSymbol(meal.name)}
                size={26}
                tintColor={mealColor(meal.name, theme.colors)}
              />
            </View>
          ) : (
            <ProgressRing
              progress={progressRatio(consumedKcal, targetKcal)}
              size={MEAL_RING_SIZE}
              thickness={5}
              color={ringColor}
            >
              {/*
                THE ICON KEEPS ITS OWN COLOUR AND NEVER TAKES THE RING'S, and
                that colour is the one belonging to what it depicts — a dawn
                sky, midday, night, a carrot.

                The glyph says WHICH meal this is; the ring says how that meal
                is going. Tinting the glyph with the ring made one fact colour
                the other, so a snack turning amber looked like a different
                snack — and it also meant the icon moved between three colours
                while the identical icon on a meal with no target stayed grey.
                It is now the same colour in both states, which is what makes
                the two read as one thing with and without a goal.
              */}
              <SymbolView
                name={mealSymbol(meal.name)}
                size={22}
                tintColor={mealColor(meal.name, theme.colors)}
              />
            </ProgressRing>
          )}

          {/*
            Name above, figure below, rather than both on one line. It gives
            the meal name room to be a real name — slice 5 lets templates call
            a meal whatever they like — and puts the kcal where the eye already
            is after reading it.
          */}
          <View style={styles.identity}>
            <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
              {meal.label}
            </Text>
            <Text style={[styles.total, { color: theme.colors.textMuted }]}>
              {targetKcal === null
                ? `${formatKcal(consumedKcal)} kcal`
                : `${formatKcal(consumedKcal)} / ${formatKcal(targetKcal)} kcal`}
            </Text>
          </View>
        </Pressable>

        {/*
          Reachable whether the meal is open or not (specs 8.3), and sized to
          be the obvious thing to hit: roughly three quarters of the row's
          height. Logging a meal is the action the whole application exists
          for (specs 4), and D16 says the 15-second target is met by removing
          gestures — a target you have to aim at is a gesture in itself.
        */}
        <Pressable
          onPress={onAdd}
          accessibilityRole="button"
          accessibilityLabel={`Ajouter à ${meal.label}`}
          hitSlop={10}
          style={styles.add}
        >
          <SymbolView
            name="plus.circle.fill"
            size={MEAL_RING_SIZE}
            tintColor={theme.colors.accent}
          />
        </Pressable>
      </View>

      {/*
        ITS OWN ROW, SPANNING THE CARD, rather than tucked under the kcal line
        inside the identity block — which is where it was asked for and where
        it does not fit. Beside the chevron, the ring and a 54-point add
        button, the identity column is about 187 points wide; three columns of
        it leave 62 each, and "Gluc. 240 / 100 g" needs more than that at any
        size still worth reading. Given the card's full width each column gets
        over a hundred, and the band still reads as sitting under the kcal.
      */}
      {meal.targets === null ? null : (
        <MacroBand consumed={consumed} targets={meal.targets} />
      )}

      {open ? (
        <View style={[styles.entries, { borderTopColor: theme.colors.border }]}>
          {entries.data === undefined || entries.data.length === 0 ? (
            <Text style={[styles.empty, { color: theme.colors.textFaint }]}>
              Rien pour l’instant.
            </Text>
          ) : (
            entries.data.map((entry, index) => (
              <View key={entry.id}>
                {/*
                  Between the rows and never around them: a line above the
                  first or below the last would box the list in, when the card
                  already does that. Inset to where the text starts, as a
                  system list is, so the rows read as one list rather than as
                  separate things stacked.

                  Outside the swipeable row, not inside it, so it stays put
                  while a row travels under the finger.
                */}
                {index === 0 ? null : (
                  <ListSeparator />
                )}
                {/*
                  The press goes to the swipe row, not to the entry: the two
                  recognisers do not arbitrate with each other, so a Pressable
                  inside fired on the release of a swipe — the same defect the
                  basket showed, on the screen that is used most.

                  A grouped recipe block takes the whole arrangement over: its
                  own tap folds rather than edits, and its ingredient lines
                  hang under it instead of beside it (specs 8.6).
                */}
                {entry.children.length > 0 ? (
                  <RecipeBlockRow
                    entry={entry}
                    onDelete={() => onDeleteEntry(entry)}
                    onAdjust={() => onEditEntry(entry)}
                  />
                ) : (
                  <SwipeToDeleteRow
                    onDelete={() => onDeleteEntry(entry)}
                    onPress={() => onEditEntry(entry)}
                    accessibilityLabel={`Modifier ${entry.name}`}
                  >
                    <EntryRow entry={entry} />
                  </SwipeToDeleteRow>
                )}
              </View>
            ))
          )}
        </View>
      ) : null}
    </View>
  );
}

/**
 * The ring and the add button are the same size, and that is the point.
 *
 * They are the two circles on the row, one at each end, and the eye reads a
 * pair before it reads either. At 34 against 54 they were a small thing and a
 * big thing that happened to both be round; matched, the row has two poles
 * rather than a button and an ornament.
 *
 * One constant, used by both, so they cannot drift apart in a later edit.
 */
const MEAL_RING_SIZE = 54;

/** The three that have bars. Calories are the ring, not a fourth bar. */
const MACRO_BARS: readonly {
  key: 'protein' | 'carbs' | 'fat';
  label: string;
  token: 'macroProtein' | 'macroCarbs' | 'macroFat';
}[] = [
  { key: 'protein', label: 'Prot.', token: 'macroProtein' },
  { key: 'carbs', label: 'Gluc.', token: 'macroCarbs' },
  { key: 'fat', label: 'Lip.', token: 'macroFat' },
];

/**
 * The three bars, as their own component so the narrowing is real.
 *
 * Taking `targets` already non-null is what lets the caller pass it after a
 * null check instead of asserting it away — conventions section 4 rules out
 * assertions, and a `!` here would be one on the very value the whole band
 * depends on.
 */
function MacroBand({ consumed, targets }: { consumed: Macros; targets: Macros }) {
  const theme = useTheme();

  return (
    <View style={styles.macroBand}>
      {MACRO_BARS.map((bar) => (
        <MacroBar
          key={bar.key}
          label={bar.label}
          consumed={consumed[bar.key]}
          target={targets[bar.key]}
          color={theme.colors[bar.token]}
        />
      ))}
    </View>
  );
}

/**
 * One macro of the meal: what it stands at, over a bar.
 *
 * NEVER RED, however full — the same rule as the day's three bars. Going over
 * on carbohydrates is not the same kind of event as going over on the day, and
 * a row of red bars would say that it was. The ring is the one thing on this
 * card allowed to raise its voice.
 */
function MacroBar({
  label,
  consumed,
  target,
  color,
}: {
  label: string;
  consumed: number;
  target: number;
  color: string;
}) {
  const theme = useTheme();

  return (
    <View style={styles.macroColumn}>
      <Text style={[styles.macroText, { color: theme.colors.textMuted }]} numberOfLines={1}>
        {`${label} ${formatMacroWhole(consumed)} / ${formatMacroWhole(target)} g`}
      </Text>
      <View style={[styles.macroTrack, { backgroundColor: theme.colors.border }]}>
        <View
          style={[
            styles.macroFill,
            { backgroundColor: color, width: `${progressRatio(consumed, target) * 100}%` },
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // overflow hidden so the swipe-to-delete row cannot paint outside the
  // rounded corners while it is being dragged.
  container: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  headerRow: { flexDirection: 'row', alignItems: 'center' },
  headerPress: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 16,
    paddingLeft: 18,
  },
  identity: { flex: 1, gap: 3 },
  // Bold, not semibold: the name is what the row IS, and it now sits beside a
  // coloured glyph and above a line of figures that are both quieter than it.
  name: { fontSize: 17, fontWeight: '700' },
  total: { fontSize: 14, fontVariant: ['tabular-nums'] },
  // Tighter than the row's own padding: the glyph is large enough to carry the
  // target on its own, so padding here would only push it off the edge.
  add: { paddingHorizontal: 14, paddingVertical: 10 },
  entries: { borderTopWidth: StyleSheet.hairlineWidth },
  empty: { fontSize: 14, paddingHorizontal: 18, paddingVertical: 16 },
  // Pulled up under the header rather than spaced from it: the band belongs to
  // the figure above it, not to the list below.
  macroBand: {
    flexDirection: 'row',
    gap: 12,
    paddingHorizontal: 18,
    paddingBottom: 14,
    marginTop: -6,
  },
  // The same box the ring occupies, so a day mixing meals with and without a
  // target keeps one column of names rather than two.
  iconAlone: {
    width: MEAL_RING_SIZE,
    height: MEAL_RING_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroColumn: { flex: 1, gap: 4 },
  macroText: { fontSize: 11, fontVariant: ['tabular-nums'] },
  macroTrack: { height: 4, borderRadius: 2, overflow: 'hidden' },
  macroFill: { height: 4, borderRadius: 2 },
});
