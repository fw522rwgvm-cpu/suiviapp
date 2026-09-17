import { SymbolView } from 'expo-symbols';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import type { JournalEntryView } from '../data/day-reads';
import { EntryRow } from './entry-row';
import { ListSeparator } from '@/core/ui/list-separator';
import { SwipeToDeleteRow } from '@/core/ui/swipe-to-delete-row';

/**
 * A grouped recipe block in the journal (specs 8.6).
 *
 * > L'entrée apparaît comme un bloc groupé, repliable et ré-éditable.
 *
 * The parent states how much of the recipe was eaten and what the block came
 * to; the ingredient lines below carry the macros (D5/R2). Folding is the
 * default, for the reason meals are folded by default: a journal is read as a
 * list of what was eaten, and a four-ingredient recipe expanded on sight
 * pushes the next meal off the screen.
 *
 * ## WHAT TAPPING DOES, AND THE DIVERGENCE IT CARRIES
 *
 * Tapping the parent FOLDS AND UNFOLDS. Specs 8.3 point 6 says touching an
 * entry opens the adjustment screen, and that stays true of every other row;
 * here it cannot, and the reason is a gesture arbitration this project has
 * already paid for once.
 *
 * The row's tap belongs to SwipeToDeleteRow, where it races the pan and loses
 * to it — which is the whole fix slice 4 had to make after a swipe that ended
 * on a row fired its press. A second tap target inside that subtree, for the
 * chevron, would be React Native's responder system nested in a gesture
 * subtree: the documented trap, reintroduced deliberately.
 *
 * So the row has ONE tap, and it is the one specs 8.6 asks for that specs 8.3
 * does not have a rule about. Re-editing is a named button at the foot of the
 * opened block — where the ingredients it is about to edit are in sight, which
 * is a better place for it than a row that says nothing about them.
 *
 * Consigned as an amendment rather than left as a divergence (specs 14.7).
 *
 * ## THE CHILDREN DO NOT SWIPE
 *
 * An ingredient line is not a journal entry anyone chose; it is part of a
 * block. Deleting one would leave a recipe whose occurrence no longer matches
 * any recipe, and specs 8.6 gives exactly one way to change an occurrence: the
 * adjustment screen. Swiping the PARENT removes the whole block, children and
 * all, by cascade — one statement, which is why deleteEntry never had to loop.
 */
export function RecipeBlockRow({
  entry,
  onDelete,
  onAdjust,
}: {
  entry: JournalEntryView;
  onDelete: () => void;
  onAdjust: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState(false);

  return (
    <View>
      <SwipeToDeleteRow
        onDelete={onDelete}
        onPress={() => setOpen((current) => !current)}
        accessibilityLabel={`${open ? 'Replier' : 'Déplier'} ${entry.name}`}
      >
        <EntryRow entry={entry} expanded={open} />
      </SwipeToDeleteRow>

      {open ? (
        <View style={styles.children}>
          {entry.children.map((child) => (
            <View key={child.id}>
              <ListSeparator />
              {/*
                Indented, and with no swipe of its own. The indent is what says
                these belong to the row above rather than to the meal — without
                it a block reads as a parent that happens to be followed by
                four entries, which is exactly what it looked like before this
                component existed.
              */}
              <View style={styles.child}>
                <EntryRow entry={child} />
              </View>
            </View>
          ))}

          <ListSeparator />
          <Pressable
            onPress={onAdjust}
            accessibilityRole="button"
            accessibilityLabel={`Ajuster ${entry.name} pour cette occurrence`}
            style={({ pressed }) => [
              styles.adjust,
              { backgroundColor: pressed ? theme.colors.background : 'transparent' },
            ]}
          >
            <SymbolView name="slider.horizontal.3" size={15} tintColor={theme.colors.accent} />
            <Text style={[styles.adjustLabel, { color: theme.colors.accent }]}>
              Ajuster cette occurrence
            </Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  children: {},
  // Enough to read as a level down without costing the macros their line: the
  // grey line under an ingredient already carries five values.
  child: { paddingLeft: 16 },
  adjust: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 11,
    paddingHorizontal: 30,
  },
  adjustLabel: { fontSize: 14 },
});
