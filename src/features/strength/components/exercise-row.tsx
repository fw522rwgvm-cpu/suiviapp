import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { GlassButton } from '@/core/ui/glass-button';
import { useTheme } from '@/core/theme';
import type { ExerciseListItem } from '../data/exercise-reads';
import { ExerciseDrawing } from './exercise-drawing';
import { equipmentLabel, muscleLabel } from '../domain/vocabulary';

/**
 * One exercise in a list (specs 10.1).
 *
 * > Chaque résultat affiche vignette, nom, muscle, matériel.
 *
 * ## THE THUMBNAIL IS HERE NOW, AND THE REASON IT WAS NOT HAS EXPIRED
 *
 * Slice 10 left it out deliberately: media needed expo-image-picker, outside
 * section 5, so nothing could write `exercise.media_uri` and every row would
 * have shown the SAME placeholder. "A column of identical grey squares is not a
 * vignette, it is an apology" — and that was right while it was true.
 *
 * The catalogue writes `media_uri` for every exercise it installs, so the
 * column is now mostly pictures and the grey square is the exception it was
 * always meant to be: the substitute of specs 5.4 no 3, for an exercise
 * somebody typed themselves. The row was built keeping the space this needs, so
 * adding it moved nothing else.
 *
 * ONE POSE, not two. The pair says how a movement runs; at 44 pt it would say
 * it twice in half the width, which is two thumbnails of nothing. The page
 * shows both — see ExerciseDrawing.
 *
 * ## THE SECOND LINE IS "MUSCLE · MATÉRIEL", AND THE SEPARATOR IS NOT A COMMA
 *
 * FoodRow joins a brand and a quantity with a comma, because they are two facts
 * about one thing. These are two DIMENSIONS — what it works and what it is done
 * with — and a middle dot reads as a pair of coordinates rather than a list.
 * It is also what the filter chips above are filtering on, so the row and the
 * control say the same words.
 *
 * An exercise with no stated equipment simply has a shorter line. Nothing
 * invents "Aucun" for it: the editor always asks, so a blank means an older
 * row, and saying so would be louder than the fact deserves.
 */
export function ExerciseRow({
  exercise,
  onPress,
  onToggleFavorite,
}: {
  exercise: ExerciseListItem;
  onPress: () => void;
  onToggleFavorite?: () => void;
}) {
  const theme = useTheme();

  const equipment = equipmentLabel(exercise.equipment);
  const subtitle =
    equipment === null
      ? muscleLabel(exercise.primaryMuscle)
      : `${muscleLabel(exercise.primaryMuscle)} · ${equipment}`;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${exercise.name}, ${subtitle}`}
      style={({ pressed }) => [
        styles.row,
        { backgroundColor: pressed ? theme.colors.background : theme.colors.surface },
      ]}
    >
      <View style={styles.thumb}>
        <ExerciseDrawing mediaUri={exercise.mediaUri} height={40} />
      </View>

      <View style={styles.identity}>
        <Text style={[styles.name, { color: theme.colors.text }]} numberOfLines={1}>
          {exercise.name}
        </Text>
        <Text style={[styles.subtitle, { color: theme.colors.textMuted }]} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>

      {onToggleFavorite === undefined ? null : (
        /*
          Glass, like the star on a food row: a list row is CONTENT, and content
          receives no material from the system for free. The rule's other half
          is that a header never gets one — glass inside glass is a button
          inside a button, and it shows.
        */
        <GlassButton
          symbol={exercise.isFavorite === 1 ? 'star.fill' : 'star'}
          tintColor={exercise.isFavorite === 1 ? theme.colors.accent : theme.colors.textMuted}
          accessibilityLabel={
            exercise.isFavorite === 1 ? 'Retirer des favoris' : 'Ajouter aux favoris'
          }
          onPress={onToggleFavorite}
        />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 11,
    paddingHorizontal: 14,
    minHeight: 58,
  },
  // A fixed width, so a photograph and a substitute leave the names on one
  // column — the rule the catalogue screen already follows.
  thumb: { width: 56 },
  identity: { flex: 1, gap: 2 },
  name: { fontSize: 16, fontWeight: '500' },
  subtitle: { fontSize: 13 },
});
