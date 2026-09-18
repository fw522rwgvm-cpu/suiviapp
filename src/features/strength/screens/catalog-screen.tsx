import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppDatabase } from '@/core/db/app-database';
import { exercise } from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import { Text } from '@/core/ui/text';
import { ListSeparator } from '@/core/ui/list-separator';
import { useTheme } from '@/core/theme';
import { EXERCISE_CATALOG, catalogMediaUri } from '../catalog/exercises';
import { ExerciseDrawing } from '../components/exercise-drawing';
import { installCatalogExercises, installedCatalogNames } from '../data/catalog-writes';
import { useProgressionIncrement } from '../data/exercise-queries';
import { equipmentLabel, muscleLabel } from '../domain/vocabulary';

/**
 * The exercises a new library can be offered (specs 10.1, slice 11).
 *
 * ## EVERYTHING IS TICKED, AND THAT IS THE DEFAULT THAT RESPECTS THE READER
 *
 * The reason this screen exists is that typing twenty exercises before the
 * first workout is the one place the application asks for a quarter of an hour
 * before it serves. A list that started empty would ask for thirty-three
 * decisions instead of one, which is the same wall in a different shape.
 *
 * So the button installs everything unless something is unticked, and
 * unticking is for the person who knows they will never touch a cable machine.
 *
 * ## ALREADY-INSTALLED ENTRIES ARE SHOWN AS SUCH, BEFORE THE BUTTON
 *
 * Saying "31 installés, 2 ignorés" afterwards is a report. Saying it in advance
 * is a choice — and it is the only way the screen can be opened twice without
 * the second visit looking like it will duplicate everything.
 *
 * ## IT STAYS REACHABLE ONCE THE LIBRARY IS NO LONGER EMPTY
 *
 * Somebody who took ten and wants the other twenty-three later should not have
 * to empty their library to be offered them again. The entry point is quieter
 * once there is something there, never gone.
 */
export function CatalogScreen() {
  const theme = useTheme();
  const router = useRouter();
  const increment = useProgressionIncrement();

  const already = useQuery<Set<string>>({
    queryKey: ['exercise', 'catalog', 'installed'],
    queryFn: () => installedCatalogNames(getAppDatabase()),
    meta: readsFrom(exercise),
  });
  const installed = useMemo(() => already.data ?? new Set<string>(), [already.data]);

  /** Unticked keys. Empty means everything, which is the default. */
  const [dropped, setDropped] = useState<Set<string>>(new Set());

  const install = useMutation({
    mutationFn: (keys: readonly string[]) =>
      Promise.resolve(installCatalogExercises(getAppDatabase(), keys, increment.data ?? 2.5)),
  });

  const chosen = EXERCISE_CATALOG.filter(
    (entry) => !dropped.has(entry.key) && !installed.has(entry.key),
  );

  function toggle(key: string): void {
    setDropped((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Exercices courants' }} />
      <ScrollView
        style={{ backgroundColor: theme.colors.background }}
        contentContainerStyle={styles.content}
        contentInsetAdjustmentBehavior="automatic"
      >
        <Text style={[styles.intro, { color: theme.colors.textMuted }]}>
          Une base pour démarrer. Tout est sélectionné ; retirez ce que vous
          n’utilisez pas. Les exercices que vous avez déjà ne sont pas dupliqués.
        </Text>

        <View
          style={[
            styles.card,
            {
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.lg,
            },
            theme.shadow,
          ]}
        >
          {EXERCISE_CATALOG.map((entry, index) => {
            const here = installed.has(entry.key);
            const ticked = !here && !dropped.has(entry.key);
            return (
              <View key={entry.key}>
                {index === 0 ? null : <ListSeparator />}
                <Pressable
                  onPress={() => {
                    if (!here) toggle(entry.key);
                  }}
                  disabled={here}
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: ticked, disabled: here }}
                  accessibilityLabel={entry.name}
                  style={styles.row}
                >
                  <ExerciseDrawing
                    mediaUri={catalogMediaUri(entry.key)}
                    height={46}
                    // STILL, in a list of thirty-three: a page of animations is
                    // a page that will not sit still to be read. The movement
                    // belongs to the one exercise somebody is looking at.
                    animated={false}
                  />
                  <View style={styles.texts}>
                    <Text style={[styles.name, { color: theme.colors.text }]}>{entry.name}</Text>
                    <Text style={[styles.detail, { color: theme.colors.textMuted }]}>
                      {muscleLabel(entry.primaryMuscle)} · {equipmentLabel(entry.equipment) ?? ''}
                    </Text>
                  </View>
                  {here ? (
                    <Text style={[styles.present, { color: theme.colors.textFaint }]}>Déjà là</Text>
                  ) : (
                    <SymbolView
                      name={ticked ? 'checkmark.circle.fill' : 'circle'}
                      tintColor={ticked ? theme.colors.accent : theme.colors.textFaint}
                      size={22}
                      fallback={
                        <Text style={{ color: theme.colors.accent }}>{ticked ? '☑' : '☐'}</Text>
                      }
                    />
                  )}
                </Pressable>
              </View>
            );
          })}
        </View>

        <Pressable
          onPress={() =>
            install.mutate(
              chosen.map((entry) => entry.key),
              { onSuccess: () => router.back() },
            )
          }
          disabled={chosen.length === 0 || install.isPending}
          accessibilityRole="button"
          style={({ pressed }) => [
            styles.primary,
            {
              backgroundColor: theme.colors.accent,
              borderRadius: theme.radius.lg,
              opacity: chosen.length === 0 || pressed || install.isPending ? 0.6 : 1,
            },
          ]}
        >
          <Text style={{ color: theme.colors.onAccent, fontSize: 16, fontWeight: '600' }}>
            {chosen.length === 0
              ? 'Rien à ajouter'
              : chosen.length === 1
                ? 'Ajouter 1 exercice'
                : `Ajouter ${chosen.length} exercices`}
          </Text>
        </Pressable>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  content: { padding: 16, gap: 16, paddingBottom: 56 },
  intro: { fontSize: 14, lineHeight: 19 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, minHeight: 56 },
  texts: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '600' },
  detail: { fontSize: 13 },
  present: { fontSize: 13 },
  primary: { paddingVertical: 14, alignItems: 'center' },
});
