import { useLocalSearchParams } from 'expo-router';
import { parseLocalDate } from '@/core/date';
import { CalendarScreen } from '@/features/nutrition/screens/calendar-screen';
import { useToday } from '@/features/settings/data/settings-queries';

/**
 * Route wiring only (D10): read the parameter, hand it to the domain screen.
 *
 * `date` is the day the Journal is showing, and it travels IN through the URL
 * on purpose — it is an input, so a stale one is harmless. The chosen day
 * travels back the other way, through the request context, precisely because a
 * parameter would outlive the visit (see hooks/requested-date.tsx).
 *
 * Validated, never asserted (conventions section 4); a malformed one falls back
 * to today rather than throwing.
 */
export default function CalendarRoute() {
  const { date } = useLocalSearchParams<{ date?: string }>();
  const today = useToday();
  const parsed = date === undefined ? null : parseLocalDate(date);

  return <CalendarScreen date={parsed ?? today} />;
}
