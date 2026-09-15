import { useEffect, useState } from 'react';
import {
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { Text } from '@/core/ui/text';
import type { LocalDate } from '@/core/date';
import { formatKcal, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
import { useSettled } from '@/core/query/use-settled';
import { useDismiss, usePanelHeading } from '@/core/ui/overlay-panel';
import { FormInput, FormNavigation, FormRow, FormSection } from '@/core/ui/form-section';
import { MACRO_FIELDS, MacroFieldRow, type MacroKey } from '../components/macro-fields';
import type { JournalEntryId } from '@/core/db/schema';
import {
  useAddFreeEntry,
  useDeleteEntry,
  useEntry,
  useUpdateFreeEntry,
} from '../data/day-queries';
import { FREE_ENTRY_DEFAULT_NAME } from '../data/day-writes';
import { hasKcalWarning, theoreticalKcal, type Macros } from '../domain/macros';

/**
 * Free entry (specs 8.4d): P / G / L / kcal typed straight in, with nothing
 * created in the food database.
 *
 * The same screen adds and edits, because editing a free entry is editing the
 * same four numbers — specs 5.3 puts no time limit on that, and D5/R1 is what
 * makes it possible: the entry froze its reference, so it never needs to
 * consult anything to be corrected.
 *
 * No quantity field, deliberately. The row is stored as 100 units of a virtual
 * food (D5/R2) so that it aggregates like everything else, but that is an
 * implementation detail and never a number the user typed.
 *
 * DRAWS NO CHROME OF ITS OWN, because it is used two ways: as a step inside
 * the add modal, where the surrounding screen owns the header, and as an
 * overlay route for editing, where OverlayPanel does. A screen that declared
 * its own would fight whichever of the two it happened to be inside.
 */

interface Fields {
  name: string;
  protein: string;
  carbs: string;
  fat: string;
  kcal: string;
}

const EMPTY: Fields = { name: '', protein: '', carbs: '', fat: '', kcal: '' };

function toMacros(fields: Fields): Macros | null {
  const protein = parseDecimal(fields.protein) ?? 0;
  const carbs = parseDecimal(fields.carbs) ?? 0;
  const fat = parseDecimal(fields.fat) ?? 0;
  const kcal = parseDecimal(fields.kcal) ?? 0;

  if (protein < 0 || carbs < 0 || fat < 0 || kcal < 0) return null;
  // Four empty fields is not an entry. Anything else is, including calories
  // alone: 5.1 keeps the source's kcal as given, whatever its macros say.
  if (protein === 0 && carbs === 0 && fat === 0 && kcal === 0) return null;

  return { protein, carbs, fat, kcal };
}

export function FreeEntryScreen({
  date,
  mealPosition,
  entryId,
  initial,
  onCollect,
}: {
  date: LocalDate;
  mealPosition: number | null;
  entryId: JournalEntryId | null;
  /**
   * A line ALREADY IN THE BASKET being corrected. It has no entry id to be
   * read back from -- nothing is written until the meal is confirmed -- so it
   * arrives by value, from the basket that holds it.
   */
  initial?: { name: string; macros: Macros };
  /**
   * Supplied by the add screen, which collects lines and commits the lot in
   * one transaction when the meal is confirmed (specs 8.4). When it is here
   * this screen WRITES NOTHING; without it — the editing route — it saves as
   * it always did.
   */
  onCollect?: (entry: { name: string; macros: Macros }) => void;
}) {
  const theme = useTheme();
  const dismiss = useDismiss();

  // Named at the top of the window, on the line the actions are on, the way
  // the quantity screen names the food it is weighing. A section caption
  // saying the same thing underneath would be the title given twice.
  usePanelHeading('Saisie libre', null);

  const existing = useEntry(entryId);
  // Only once the bus has stopped flagging it: correcting an entry and
  // reopening it would otherwise fill the four figures from BEFORE the
  // correction, and saving would write them back. See core/query/use-settled.
  const settled = useSettled(existing);
  const addEntry = useAddFreeEntry();
  const updateEntry = useUpdateFreeEntry();
  const deleteEntry = useDeleteEntry();

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Filled once, from whichever of the two sources this screen has: a line
    // held in the basket, or an entry read back from the database. Reapplying
    // on every render would overwrite what is being typed.
    if (loaded) return;
    const entry = settled;
    // Macros stay nullable on the read side: only childless rows carry them,
    // and a name with no figures is still a name worth putting back.
    const source: { name: string; macros: Macros | null } | null =
      initial ??
      (entry === null || entry === undefined
        ? null
        : { name: entry.name, macros: entry.reference });
    if (source === null) return;
    const { macros: filled } = source;

    // Written back with the separator the field accepts and the user typed,
    // rather than the one JavaScript prints.
    const show = (value: number): string => String(value).replace('.', ',');
    setFields({
      // The stand-in name is storage, not something anyone typed: showing it
      // back would make the user delete a word they never wrote.
      name: source.name === FREE_ENTRY_DEFAULT_NAME ? '' : source.name,
      protein: filled === null ? '' : show(filled.protein),
      carbs: filled === null ? '' : show(filled.carbs),
      fat: filled === null ? '' : show(filled.fat),
      kcal: filled === null ? '' : show(filled.kcal),
    });
    setLoaded(true);
  }, [settled, initial, loaded]);

  const macros = toMacros(fields);
  const theoretical = macros === null ? 0 : theoreticalKcal(macros);
  const warn = macros !== null && hasKcalWarning(macros);

  // Navigation waits for the write, rather than racing it. The write is
  // synchronous and a mutation is not cancelled by unmounting, so closing
  // first would probably work — "probably" being the wrong standard for the
  // one gesture this whole slice exists to make reliable.
  const close = { onSuccess: dismiss };

  function save(): void {
    if (macros === null) return;
    if (onCollect !== undefined) {
      onCollect({ name: fields.name, macros });
      return;
    }
    if (entryId !== null) {
      updateEntry.mutate({ entryId, name: fields.name, macros }, close);
    } else if (mealPosition !== null) {
      addEntry.mutate({ date, mealPosition, name: fields.name, macros }, close);
    }
  }

  function remove(): void {
    if (entryId === null) return;
    // No confirmation. Getting here means opening the entry and pressing a
    // button that says what it does: the deliberate act has already happened,
    // and asking again about an answered question is how a dialog becomes
    // something to dismiss without reading. Specs 5.3 reserves a warning for
    // the one deletion that really destroys something, and it is not this one
    // -- what a journal entry holds, it holds alone.
    deleteEntry.mutate(entryId, close);
  }

  return (
    <FormNavigation>
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <FormSection>
          <FormRow label="Nom">
            <FormInput
              value={fields.name}
              onChangeText={(name) => setFields((current) => ({ ...current, name }))}
              placeholder={FREE_ENTRY_DEFAULT_NAME}
            />
          </FormRow>

          {/*
            NO autoFocus. Free entry has four figures and no obvious first
            field — and a name that is optional. Putting the keyboard up over a
            form nobody has read yet hides half of it to save a tap on a screen
            that needs four.

            The quantity screen is the opposite case and does focus: one field,
            already filled, where the whole point is to accept it or type over.
          */}
          {MACRO_FIELDS.map((field) => (
            <MacroFieldRow
              key={field.key}
              field={field}
              value={fields[field.key]}
              onChange={(key: MacroKey, text: string) =>
                setFields((current) => ({ ...current, [key]: text }))
              }
            />
          ))}

        </FormSection>

        {warn ? (
          <Text style={[styles.warning, { color: theme.colors.warning }]}>
            Les macros saisies donnent {formatKcal(theoretical)} kcal, soit plus de 10 %
            d’écart. La valeur saisie est conservée telle quelle.
          </Text>
        ) : null}

        <Pressable
          onPress={save}
          disabled={macros === null}
          accessibilityRole="button"
          style={[
            styles.save,
            {
              backgroundColor: macros === null ? theme.colors.border : theme.colors.accent,
            },
          ]}
        >
          <Text
            style={[
              styles.saveLabel,
              { color: macros === null ? theme.colors.textFaint : theme.colors.onAccent },
            ]}
          >
            {entryId === null ? 'Ajouter' : 'Enregistrer'}
          </Text>
        </Pressable>

        {entryId === null ? null : (
          <Pressable onPress={remove} accessibilityRole="button" style={styles.delete}>
            <Text style={[styles.deleteLabel, { color: theme.colors.danger }]}>Supprimer</Text>
          </Pressable>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
    </FormNavigation>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  warning: { fontSize: 13, lineHeight: 18 },
  save: { borderRadius: 18, paddingVertical: 16, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
  delete: { paddingVertical: 12, alignItems: 'center' },
  deleteLabel: { fontSize: 16 },
});
