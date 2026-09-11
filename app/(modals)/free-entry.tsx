import { useLocalSearchParams } from 'expo-router';
import { toLocalDate } from '@/core/date';
import type { JournalEntryId } from '@/core/db/schema';
import { FreeEntryScreen } from '@/features/nutrition/screens/free-entry-screen';

/**
 * Route wiring only (D10): read the parameters, hand them to the domain screen.
 *
 * Slice 3 turns this into the add screen of specs 8.4, with its four paths —
 * quick access, search, scan and free entry. Today there is only one, so the
 * modal is the form.
 */
export default function FreeEntryRoute() {
  const params = useLocalSearchParams<{
    date: string;
    mealPosition?: string;
    entryId?: string;
  }>();

  const mealPosition =
    params.mealPosition === undefined ? null : Number.parseInt(params.mealPosition, 10);

  return (
    <FreeEntryScreen
      // Validated at the boundary rather than asserted: a route parameter is
      // a string from outside (conventions, section 4).
      date={toLocalDate(params.date)}
      mealPosition={mealPosition === null || Number.isNaN(mealPosition) ? null : mealPosition}
      entryId={params.entryId === undefined ? null : (params.entryId as JournalEntryId)}
    />
  );
}
