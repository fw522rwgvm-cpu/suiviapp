import { useLocalSearchParams } from 'expo-router';
import { currentLocalDate, parseLocalDate } from '@/core/date';
import type { JournalEntryId } from '@/core/db/schema';
import { toEntityId } from '@/core/id';
import { FreeEntryScreen } from '@/features/nutrition/screens/free-entry-screen';

/**
 * Route wiring only (D10): read the parameters, hand them to the domain screen.
 *
 * Route parameters are strings from outside — the application puts them there,
 * but so could a deep link, the scheme being registered. They are validated
 * rather than asserted (conventions, section 4), and a malformed one falls
 * back instead of throwing: nothing on the critical path may be a blocking
 * message.
 *
 * Slice 3 turns this into the add screen of specs 8.4, with its four paths —
 * quick access, search, scan and free entry. Today there is only one, so the
 * modal is the form.
 */
export default function FreeEntryRoute() {
  const params = useLocalSearchParams<{
    date?: string;
    mealPosition?: string;
    entryId?: string;
  }>();

  const date = params.date === undefined ? null : parseLocalDate(params.date);
  const position =
    params.mealPosition === undefined ? Number.NaN : Number.parseInt(params.mealPosition, 10);

  return (
    <FreeEntryScreen
      date={date ?? currentLocalDate()}
      mealPosition={Number.isInteger(position) && position >= 0 ? position : null}
      entryId={
        params.entryId === undefined ? null : toEntityId<JournalEntryId>(params.entryId)
      }
    />
  );
}
