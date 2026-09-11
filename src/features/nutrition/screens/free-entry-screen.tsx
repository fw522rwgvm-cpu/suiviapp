import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import type { LocalDate } from '@/core/date';
import { formatKcal, parseDecimal } from '@/core/format';
import { useTheme } from '@/core/theme';
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
}: {
  date: LocalDate;
  mealPosition: number | null;
  entryId: JournalEntryId | null;
}) {
  const theme = useTheme();
  const router = useRouter();

  const existing = useEntry(entryId);
  const addEntry = useAddFreeEntry();
  const updateEntry = useUpdateFreeEntry();
  const deleteEntry = useDeleteEntry();

  const [fields, setFields] = useState<Fields>(EMPTY);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    // Filled once, when the entry arrives. Reapplying it on every render would
    // overwrite what is being typed.
    const entry = existing.data;
    if (loaded || entry === null || entry === undefined) return;
    const reference = entry.reference;
    // Written back with the separator the field accepts and the user typed,
    // rather than the one JavaScript prints.
    const show = (value: number): string => String(value).replace('.', ',');
    setFields({
      name: entry.name === FREE_ENTRY_DEFAULT_NAME ? '' : entry.name,
      protein: reference === null ? '' : show(reference.protein),
      carbs: reference === null ? '' : show(reference.carbs),
      fat: reference === null ? '' : show(reference.fat),
      kcal: reference === null ? '' : show(reference.kcal),
    });
    setLoaded(true);
  }, [existing.data, loaded]);

  const macros = toMacros(fields);
  const theoretical = macros === null ? 0 : theoreticalKcal(macros);
  const warn = macros !== null && hasKcalWarning(macros);

  // Navigation waits for the write, rather than racing it. The write is
  // synchronous and a mutation is not cancelled by unmounting, so closing
  // first would probably work — "probably" being the wrong standard for the
  // one gesture this whole slice exists to make reliable.
  const close = { onSuccess: () => router.back() };

  function save(): void {
    if (macros === null) return;
    if (entryId !== null) {
      updateEntry.mutate({ entryId, name: fields.name, macros }, close);
    } else if (mealPosition !== null) {
      addEntry.mutate({ date, mealPosition, name: fields.name, macros }, close);
    }
  }

  function remove(): void {
    if (entryId === null) return;
    Alert.alert('Supprimer cette entrée ?', undefined, [
      { text: 'Annuler', style: 'cancel' },
      {
        text: 'Supprimer',
        style: 'destructive',
        onPress: () => deleteEntry.mutate(entryId, close),
      },
    ]);
  }

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.flex}>
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        contentInsetAdjustmentBehavior="automatic"
      >
        <Field
          label="Nom"
          placeholder={FREE_ENTRY_DEFAULT_NAME}
          value={fields.name}
          onChange={(name) => setFields((current) => ({ ...current, name }))}
          keyboard="default"
        />

        <View style={[styles.card, { backgroundColor: theme.colors.surface, borderColor: theme.colors.border }]}>
          <Field
            label="Protéines (g)"
            value={fields.protein}
            onChange={(protein) => setFields((current) => ({ ...current, protein }))}
            autoFocus
          />
          <Field
            label="Glucides (g)"
            value={fields.carbs}
            onChange={(carbs) => setFields((current) => ({ ...current, carbs }))}
          />
          <Field
            label="Lipides (g)"
            value={fields.fat}
            onChange={(fat) => setFields((current) => ({ ...current, fat }))}
          />
          <Field
            label="Calories"
            value={fields.kcal}
            onChange={(kcal) => setFields((current) => ({ ...current, kcal }))}
          />
        </View>

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
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  keyboard = 'decimal-pad',
  autoFocus = false,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  keyboard?: 'default' | 'decimal-pad';
  autoFocus?: boolean;
}) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <Text style={[styles.label, { color: theme.colors.textMuted }]}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textFaint}
        keyboardType={keyboard}
        autoFocus={autoFocus}
        // Selected on focus, so the habitual gesture is type-over rather than
        // clear-then-type. Specs 8.4 makes this the lever on the 15 seconds.
        selectTextOnFocus
        style={[styles.input, { color: theme.colors.text, borderColor: theme.colors.border }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, gap: 14, paddingBottom: 48 },
  card: {
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 12,
  },
  field: { gap: 6 },
  label: { fontSize: 13 },
  input: {
    fontSize: 17,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  warning: { fontSize: 13, lineHeight: 18 },
  save: { borderRadius: 14, paddingVertical: 15, alignItems: 'center' },
  saveLabel: { fontSize: 17, fontWeight: '600' },
  delete: { paddingVertical: 12, alignItems: 'center' },
  deleteLabel: { fontSize: 16 },
});
