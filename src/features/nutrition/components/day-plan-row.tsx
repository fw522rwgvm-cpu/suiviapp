import { SymbolView } from 'expo-symbols';
import { ActionSheetIOS, Pressable, StyleSheet, Text, View } from 'react-native';
import type { LocalDate } from '@/core/date';
import type { DayTemplateId } from '@/core/db/schema';
import { useTheme } from '@/core/theme';
import {
  useApplyPlanTargets,
  useDayPlan,
  useSetOverride,
  useTemplates,
} from '../data/planning-queries';

/**
 * The line under the banner that says where this day's meals come from.
 *
 * ## IT ANSWERS THE QUESTION THE WHOLE SLICE CREATES
 *
 * Once templates exist, "why does this day look like this" has three different
 * answers, and without this row none of them is visible:
 *
 *  - a VIRTUAL day shows the template the planning resolves to right now, and
 *    tapping it overrides this one date (specs 8.1) without breaking the
 *    recurrence;
 *  - a MATERIALISED day shows the template it was frozen from, as a plain
 *    statement. It is history and it is not tappable — and it is what answers
 *    "I edited my template, why has my Thursday not changed", which specs 8.2
 *    makes correct and nothing else on the screen would explain;
 *  - a MATERIALISED day with NO targets offers to apply the ones the planning
 *    prescribes today. That is the case every day logged before 0004 is in,
 *    including today's, the moment breakfast goes in.
 *
 * The third is an explicit act, never automatic: specs 8.1 forbids a template
 * change from reaching a materialised day by itself, and 8.2 makes the user's
 * action on a day the thing that defines it. The wording says exactly what the
 * write does — the TARGETS, not the meals, not the names.
 */
export function DayPlanRow({
  date,
  materialized,
  hasTargets,
  templateName,
}: {
  date: LocalDate;
  materialized: boolean;
  /** True once any meal of this day carries a target. */
  hasTargets: boolean;
  /** The snapshot on a materialised day, the resolved name on a virtual one. */
  templateName: string | null;
}) {
  const theme = useTheme();

  const plan = useDayPlan(date);
  const templates = useTemplates();
  const setOverride = useSetOverride();
  const applyTargets = useApplyPlanTargets();

  const available = templates.data ?? [];

  /** The template the PLANNING prescribes today, whatever this day was frozen from. */
  const prescribed = plan.data?.templateName ?? null;

  function chooseOverride(): void {
    if (available.length === 0) return;

    const current = plan.data?.level === 'override' ? (plan.data.templateId ?? null) : null;
    const options = [
      ...available.map((template) =>
        template.id === current ? `✓ ${template.name}` : template.name,
      ),
      'Suivre le planning',
      'Annuler',
    ];

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title: 'Modèle de cette journée',
        message:
          'Ne vaut que pour cette date, et ne change rien à la récurrence de la semaine.',
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: current === null ? undefined : options.length - 2,
      },
      (index) => {
        if (index === options.length - 1) return;
        const templateId: DayTemplateId | null =
          index === options.length - 2 ? null : (available[index]?.id ?? null);
        setOverride.mutate({ date, templateId });
      },
    );
  }

  // A materialised day with targets: a statement, not a control. Silent when
  // it was frozen without a template, which is every day before 0004 — there
  // is nothing to say, and the row below says what can be done about it.
  if (materialized && hasTargets) {
    return templateName === null ? null : (
      <Text style={[styles.statement, { color: theme.colors.textFaint }]}>
        {`Journée créée avec « ${templateName} ». Modifier le modèle ne la change plus.`}
      </Text>
    );
  }

  if (materialized) {
    if (prescribed === null) return null;

    return (
      <Pressable
        onPress={() => applyTargets.mutate(date)}
        accessibilityRole="button"
        accessibilityLabel={`Appliquer les objectifs de ${prescribed}`}
        style={[
          styles.action,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        <View style={styles.actionText}>
          <Text style={[styles.actionTitle, { color: theme.colors.text }]}>
            {`Appliquer les objectifs de « ${prescribed} »`}
          </Text>
          <Text style={[styles.actionNote, { color: theme.colors.textFaint }]}>
            Cette journée a été créée avant vos modèles. Seuls les objectifs changent.
          </Text>
        </View>
        <SymbolView name="arrow.down.circle" size={20} tintColor={theme.colors.accent} />
      </Pressable>
    );
  }

  // Virtual: the planning in force right now, and a way to override this date.
  return (
    <Pressable
      onPress={chooseOverride}
      disabled={available.length === 0}
      accessibilityRole="button"
      accessibilityLabel={`Modèle de la journée : ${templateName ?? 'aucun'}`}
      style={styles.row}
    >
      <Text style={[styles.rowLabel, { color: theme.colors.textMuted }]}>Modèle</Text>
      <Text
        style={[
          styles.rowValue,
          { color: templateName === null ? theme.colors.textFaint : theme.colors.text },
        ]}
        numberOfLines={1}
      >
        {templateName ?? 'Aucun'}
      </Text>
      {available.length === 0 ? null : (
        <SymbolView
          name="chevron.up.chevron.down"
          size={11}
          tintColor={theme.colors.textFaint}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 4,
    minHeight: 28,
  },
  rowLabel: { fontSize: 13 },
  rowValue: { fontSize: 13, flex: 1, fontWeight: '600' },
  statement: { fontSize: 12, lineHeight: 17, paddingHorizontal: 4 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  actionText: { flex: 1, gap: 2 },
  actionTitle: { fontSize: 15, fontWeight: '600' },
  actionNote: { fontSize: 12, lineHeight: 16 },
});
