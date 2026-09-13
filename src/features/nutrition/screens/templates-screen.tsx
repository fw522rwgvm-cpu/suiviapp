import { SymbolView } from 'expo-symbols';
import { Stack, useRouter } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { EmptyState } from '@/core/ui/empty-state';
import { ListSeparator } from '@/core/ui/list-separator';
import { getAppDatabase } from '@/core/db/app-database';
import type { DayTemplateId } from '@/core/db/schema';
import { readTemplateUsage } from '../data/planning-reads';
import { useDeleteTemplate, useTemplates } from '../data/planning-queries';
import { SwipeToDeleteRow } from '../components/swipe-to-delete-row';

/**
 * The list of day templates (specs 8.1, 8.8, 12).
 *
 * > Creation of an unlimited number of day templates.
 *
 * Pushed inside the Settings tab's own stack, so the tab bar stays and the
 * back gesture is the system's — the rule the whole application follows:
 * BROWSING IS A PUSH, ADDING IS A MODAL. Editing a template is browsing into
 * it, so it pushes too; there is nothing here that happens "on top of" the
 * settings.
 *
 * Holds no calculation and no query of its own beyond the hooks (D9, D10).
 */
export function TemplatesScreen() {
  const theme = useTheme();
  const router = useRouter();

  const templates = useTemplates();
  const remove = useDeleteTemplate();

  /**
   * Names what the deletion will actually take, then does it (specs 5.3 v2.2).
   *
   * > A warning naming explicitly what will be lost. Deletion stays allowed
   * > after confirmation.
   *
   * The usage is read here rather than held by a query, because it is needed
   * once, at the moment of the tap, and a hook per row would fetch it for
   * every template on every render. It counts ASSIGNMENTS and never
   * materialised days: a logged day keeps its own copy of everything and is
   * untouched, so mentioning it would frighten the user out of an operation
   * that costs them nothing.
   */
  function confirmDelete(id: DayTemplateId, name: string): void {
    const usage = readTemplateUsage(getAppDatabase(), id);
    const losses: string[] = [];

    if (usage.weekdays.length > 0) {
      losses.push(
        usage.weekdays.length === 1
          ? '1 jour de la semaine'
          : `${usage.weekdays.length} jours de la semaine`,
      );
    }
    if (usage.overrides.length > 0) {
      losses.push(
        usage.overrides.length === 1 ? '1 date surchargée' : `${usage.overrides.length} dates surchargées`,
      );
    }
    if (usage.isDefault) losses.push('le modèle par défaut');

    const message =
      losses.length === 0
        ? 'Les journées déjà enregistrées gardent leurs repas et leurs objectifs.'
        : `${losses.join(', ')} perdront leur affectation. Les journées déjà ` +
          'enregistrées gardent leurs repas et leurs objectifs.';

    Alert.alert(`Supprimer « ${name} » ?`, message, [
      { text: 'Annuler', style: 'cancel' },
      { text: 'Supprimer', style: 'destructive', onPress: () => remove.mutate(id) },
    ]);
  }

  const rows = templates.data ?? [];

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Modèles de journée',
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/(tabs)/settings/templates/new')}
              hitSlop={12}
              accessibilityRole="button"
              accessibilityLabel="Nouveau modèle"
            >
              <SymbolView name="plus" size={20} tintColor={theme.colors.accent} />
            </Pressable>
          ),
        }}
      />

      {rows.length === 0 ? (
        // EmptyState brings its own scroll view, so it stands alone rather
        // than nesting inside one.
        <EmptyState
          symbol="calendar"
          title="Aucun modèle"
          message={
            'Un modèle décrit les repas d’une journée et leurs objectifs. Sans modèle, ' +
            'le Journal propose quatre repas sans objectif.'
          }
          note="Touchez + pour en créer un."
        />
      ) : (
        <ScrollView
          style={{ backgroundColor: theme.colors.background }}
          contentContainerStyle={styles.container}
          contentInsetAdjustmentBehavior="automatic"
        >
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
            {rows.map((template, index) => (
              <View key={template.id}>
                {index === 0 ? null : <ListSeparator />}
                <SwipeToDeleteRow
                  accessibilityLabel={template.name}
                  onPress={() =>
                    router.push(`/(tabs)/settings/templates/${template.id}`)
                  }
                  onDelete={() => confirmDelete(template.id, template.name)}
                >
                  <View style={styles.row}>
                    <Text
                      style={[styles.name, { color: theme.colors.text }]}
                      numberOfLines={1}
                    >
                      {template.name}
                    </Text>
                    <Text style={[styles.count, { color: theme.colors.textMuted }]}>
                      {template.mealCount === 1
                        ? '1 repas'
                        : `${template.mealCount} repas`}
                    </Text>
                    <SymbolView
                      name="chevron.right"
                      size={13}
                      tintColor={theme.colors.textFaint}
                    />
                  </View>
                </SwipeToDeleteRow>
              </View>
            ))}
          </View>

          <Text style={[styles.note, { color: theme.colors.textFaint }]}>
            Modifier un modèle ne change rien aux journées déjà enregistrées : chacune
            garde les repas et les objectifs copiés le jour où elle a été créée.
          </Text>
        </ScrollView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  container: { padding: 16, paddingBottom: 48, gap: 14 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    minHeight: 44,
    paddingVertical: 9,
  },
  name: { fontSize: 17, flex: 1 },
  count: { fontSize: 15 },
  note: { fontSize: 12, lineHeight: 17, marginHorizontal: 4 },
});
