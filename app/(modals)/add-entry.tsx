import { useLocalSearchParams } from 'expo-router';
import { parseLocalDate } from '@/core/date';
import { AddEntryScreen } from '@/features/nutrition/screens/add-entry-screen';
import { useToday } from '@/features/settings/data/settings-queries';

/**
 * Route wiring only (D10): read the parameters, hand them to the domain screen.
 *
 * The full-screen modal of specs 7, and the screen shown by default when
 * adding to the journal (specs 8.4a). Parameters are validated rather than
 * asserted, and a malformed one falls back instead of throwing.
 */
export default function AddEntryRoute() {
  const params = useLocalSearchParams<{ date?: string; mealPosition?: string }>();
  const today = useToday();

  const date = params.date === undefined ? null : parseLocalDate(params.date);
  const position =
    params.mealPosition === undefined ? Number.NaN : Number.parseInt(params.mealPosition, 10);

  return (
    <AddEntryScreen
      date={date ?? today}
      mealPosition={Number.isInteger(position) && position >= 0 ? position : null}
    />
  );
}
