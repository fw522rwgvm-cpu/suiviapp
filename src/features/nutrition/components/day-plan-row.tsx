import { SymbolView } from 'expo-symbols';
import { ActionSheetIOS, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import type { LocalDate } from '@/core/date';
import type { DayTemplateId } from '@/core/db/schema';
import { useTheme } from '@/core/theme';
import { useSetDayTemplate, useTemplates } from '../data/planning-queries';

/**
 * The control at the foot of the day that says which template it follows.
 *
 * ## ONE CONTROL, ALWAYS THERE
 *
 * It used to be three different things in one place — a statement on a frozen
 * day, an "apply the targets" button on a day that had none, and a picker on a
 * day nobody had touched. Three behaviours behind one row, and the one that
 * mattered most was missing: A DAY WITH AN ENTRY IN IT OFFERED NOTHING AT ALL.
 * The moment breakfast was logged, the day's template stopped being something
 * that could be changed.
 *
 * Now it is one row with one job, and it behaves the same whatever state the
 * day is in.
 *
 * ## WHY IT IS NOT MERELY AN OVERRIDE
 *
 * An override is read only while a day is VIRTUAL. On a materialised day it
 * writes a row that changes nothing on screen — the day holds its own meals and
 * never consults the planning again (specs 8.1). Offering "change the template"
 * there and having nothing happen would be a control that lies.
 *
 * So the write does both halves in one transaction: it records the override,
 * and applies the chosen template's targets to the day when the day already
 * exists. See setDayTemplate.
 *
 * That is not the retroactive effect 8.1 forbids: 8.2 makes the user's action
 * on a day the act that defines it, and this is an action on this day, taken
 * deliberately, once.
 *
 * ## AT THE FOOT OF THE MEALS, NOT ABOVE THEM
 *
 * It sat under the banner, where it read as a property of the figures. It is a
 * property of the LIST — these meals came from somewhere — so it belongs where
 * the list ends.
 */
export function DayPlanRow({
  date,
  materialized,
  templateName,
}: {
  date: LocalDate;
  materialized: boolean;
  /** The snapshot on a materialised day, the resolved name on a virtual one. */
  templateName: string | null;
}) {
  const theme = useTheme();

  const templates = useTemplates();
  const setDayTemplate = useSetDayTemplate();

  const available = templates.data ?? [];

  function choose(): void {
    if (available.length === 0) return;

    const options = [
      ...available.map((template) =>
        template.name === templateName ? `✓ ${template.name}` : template.name,
      ),
      'Suivre le planning',
      'Annuler',
    ];

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Modèle de cette journée',
        // The two regimes say different things because they DO different
        // things, and the materialised one is the one that needs warning.
        message: materialized
          ? 'Les objectifs de cette journée seront remplacés. Les repas et les ' +
            'entrées déjà enregistrés ne changent pas.'
          : 'Ne vaut que pour cette date, et ne change rien à la récurrence de la semaine.',
        options,
        cancelButtonIndex: options.length - 1,
      },
      (index) => {
        if (index === options.length - 1) return;

        const templateId: DayTemplateId | null =
          index === options.length - 2 ? null : (available[index]?.id ?? null);
        setDayTemplate.mutate({ date, templateId });
      },
    );
  }

  // Nothing to choose between, and nowhere here to make one: the row would be
  // a control that cannot be used. Templates are created in the Settings.
  if (available.length === 0) return null;

  return (
    <Pressable
      onPress={choose}
      accessibilityRole="button"
      accessibilityLabel={`Modèle de la journée : ${templateName ?? 'aucun'}`}
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      <SymbolView name="calendar.badge.clock" size={18} tintColor={theme.colors.textMuted} />

      <View style={styles.text}>
        <Text style={[styles.label, { color: theme.colors.textMuted }]}>Modèle</Text>
        <Text
          style={[
            styles.value,
            { color: templateName === null ? theme.colors.textFaint : theme.colors.text },
          ]}
          numberOfLines={1}
        >
          {templateName ?? 'Aucun'}
        </Text>
      </View>

      <SymbolView
        name="chevron.up.chevron.down"
        size={12}
        tintColor={theme.colors.textFaint}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    minHeight: 52,
    paddingVertical: 8,
  },
  text: { flex: 1, gap: 1 },
  label: { fontSize: 12 },
  value: { fontSize: 15, fontWeight: '600' },
});
