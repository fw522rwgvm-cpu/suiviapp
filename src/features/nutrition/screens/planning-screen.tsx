import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { ActionSheetIOS, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { formatLongDate, weekdayNameOf } from '@/core/format';
import type { DayTemplateId } from '@/core/db/schema';
import { useTheme } from '@/core/theme';
import { ListSeparator } from '@/core/ui/list-separator';
import {
  useAssignWeekday,
  usePlanning,
  useSetDefaultTemplate,
  useSetOverride,
  useTemplates,
} from '../data/planning-queries';
import type { TemplateSummary } from '../data/planning-reads';

/**
 * The weekly planning, the default template and the one-off overrides
 * (specs 8.1, 8.8, 12).
 *
 * > Assignment to a date: weekly recurrence, with the ability to override a
 * > single date without breaking the recurrence. A default template applies to
 * > any weekday with no assignment.
 *
 * ## THE PICKER IS THE SYSTEM'S
 *
 * ActionSheetIOS is a real UIAlertController, from React Native's own core —
 * no dependency, and no list drawn in JavaScript. That is the iOS 26 direction
 * applied as written: the chrome belongs to the system, configured rather than
 * painted. A template list is exactly what an action sheet is for, and it
 * carries the cancel and destructive roles for free.
 *
 * ## WHY OVERRIDES ARE LISTED HERE BUT SET FROM THE JOURNAL
 *
 * An override is about the date you are looking at, and the date you are
 * looking at is in the Journal. Setting one from here would mean leaving the
 * day, finding it again in a calendar, and coming back. But an override set
 * three weeks ago on a future date is invisible from the Journal until you
 * happen to swipe onto it — so the list lives here, where it can be found and
 * removed.
 */
export function PlanningScreen() {
  const theme = useTheme();
  const router = useRouter();

  const planning = usePlanning();
  const templates = useTemplates();
  const assign = useAssignWeekday();
  const setDefault = useSetDefaultTemplate();
  const setOverride = useSetOverride();

  const available = templates.data ?? [];
  const view = planning.data;

  /**
   * Offers the templates, plus a way to clear the slot.
   *
   * `chooseNone` is worded by the caller because "no template" means two
   * different things: a weekday with no assignment falls to the default, while
   * no default at all falls to the built-in meal list. Saying so at the point
   * of the choice is cheaper than explaining it afterwards.
   */
  function choose(
    title: string,
    chooseNone: string,
    current: DayTemplateId | null,
    onPick: (templateId: DayTemplateId | null) => void,
  ): void {
    if (available.length === 0) {
      router.push('/(tabs)/settings/templates');
      return;
    }

    const options = [...available.map(labelOf(current)), chooseNone, 'Annuler'];

    ActionSheetIOS.showActionSheetWithOptions(
      {
        title,
        options,
        cancelButtonIndex: options.length - 1,
        destructiveButtonIndex: current === null ? undefined : options.length - 2,
      },
      (index) => {
        if (index === options.length - 1) return;
        if (index === options.length - 2) {
          onPick(null);
          return;
        }
        const picked = available[index];
        if (picked !== undefined) onPick(picked.id);
      },
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Planning' }} />

      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.container}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={[styles.caption, { color: theme.colors.textFaint }]}>SEMAINE</Text>
        <Card>
          {(view?.week ?? []).map((entry, index) => (
            <View key={entry.weekday}>
              {index === 0 ? null : <ListSeparator />}
              <PickerRow
                label={weekdayLabel(entry.weekday)}
                value={entry.templateName ?? 'Modèle par défaut'}
                muted={entry.templateId === null}
                onPress={() =>
                  choose(
                    weekdayLabel(entry.weekday),
                    'Utiliser le modèle par défaut',
                    entry.templateId,
                    (templateId) => assign.mutate({ weekday: entry.weekday, templateId }),
                  )
                }
              />
            </View>
          ))}
        </Card>

        <Text style={[styles.caption, { color: theme.colors.textFaint }]}>
          MODÈLE PAR DÉFAUT
        </Text>
        <Card>
          <PickerRow
            label="Par défaut"
            value={view?.defaultTemplateName ?? 'Aucun'}
            muted={view?.defaultTemplateId == null}
            onPress={() =>
              choose(
                'Modèle par défaut',
                'Aucun modèle par défaut',
                view?.defaultTemplateId ?? null,
                (templateId) => setDefault.mutate(templateId),
              )
            }
          />
        </Card>
        <Text style={[styles.note, { color: theme.colors.textFaint }]}>
          S’applique à tout jour de la semaine sans affectation. Sans modèle par défaut, une
          journée non affectée propose quatre repas sans objectif.
        </Text>

        <Text style={[styles.caption, { color: theme.colors.textFaint }]}>
          DATES SURCHARGÉES
        </Text>
        {(view?.overrides.length ?? 0) === 0 ? (
          <Text style={[styles.note, { color: theme.colors.textFaint }]}>
            Aucune. Une surcharge se pose depuis le Journal, sur la journée concernée, et
            ne casse pas la récurrence.
          </Text>
        ) : (
          <Card>
            {(view?.overrides ?? []).map((override, index) => (
              <View key={override.date}>
                {index === 0 ? null : <ListSeparator />}
                <PickerRow
                  label={formatLongDate(override.date)}
                  value={override.templateName}
                  muted={false}
                  onPress={() =>
                    choose(
                      formatLongDate(override.date),
                      'Retirer la surcharge',
                      override.templateId,
                      (templateId) => setOverride.mutate({ date: override.date, templateId }),
                    )
                  }
                />
              </View>
            ))}
          </Card>
        )}

        {available.length === 0 ? (
          <Text style={[styles.note, { color: theme.colors.textFaint }]}>
            Aucun modèle n’existe encore. Touchez une ligne pour en créer un.
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

/** Marks the one already chosen, so the sheet says where you are. */
function labelOf(current: DayTemplateId | null) {
  return (template: TemplateSummary): string =>
    template.id === current ? `✓ ${template.name}` : template.name;
}

/**
 * Capitalised for a row heading. core/format holds the seven words, indexed by
 * ISO weekday, and this only changes the first letter — duplicating the list
 * here would put a second copy right beside planning_weekday, which is exactly
 * where a drift would hurt.
 */
function weekdayLabel(isoWeekday: number): string {
  const name = weekdayNameOf(isoWeekday);
  return name === '' ? '' : name[0]!.toUpperCase() + name.slice(1);
}

function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      {children}
    </View>
  );
}

function PickerRow({
  label,
  value,
  muted,
  onPress,
}: {
  label: string;
  value: string;
  /** The value is a fallback rather than a choice, so it reads quieter. */
  muted: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${value}`}
      style={styles.row}
    >
      <Text style={[styles.label, { color: theme.colors.text }]}>{label}</Text>
      <Text
        style={[styles.value, { color: muted ? theme.colors.textFaint : theme.colors.text }]}
        numberOfLines={1}
      >
        {value}
      </Text>
      <SymbolView name="chevron.up.chevron.down" size={12} tintColor={theme.colors.textFaint} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48, gap: 7 },
  caption: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginLeft: 16, marginTop: 11 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    paddingVertical: 7,
  },
  label: { fontSize: 17 },
  value: { fontSize: 17, flex: 1, textAlign: 'right' },
  note: { fontSize: 12, lineHeight: 17, marginHorizontal: 16 },
});
