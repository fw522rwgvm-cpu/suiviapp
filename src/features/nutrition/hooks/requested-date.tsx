import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import type { ReactNode } from 'react';
import { currentLocalDate, type LocalDate } from '@/core/date';
import { usePreferences } from '@/features/settings/data/settings-queries';

/**
 * How the calendar screen tells the Journal which day to show.
 *
 * ## Why a context rather than route parameters
 *
 * The calendar became a route so it could use the system's zoom transition,
 * which animates a NAVIGATION and therefore needs a destination. That leaves
 * the return trip to arrange, and the obvious answer — put the date in the URL
 * — is the wrong one here for two reasons.
 *
 * A parameter persists in the navigation state. Specs 7 says the Journal opens
 * on the current day, never on the last date consulted, and a date left in the
 * route would quietly outlive the visit that put it there. It would also mean
 * the Journal reading its date from two places at once, the parameter and the
 * swipe — and the carousel is the one piece of this screen that has been
 * verified on the device.
 *
 * So the date travels as a REQUEST, consumed once: the calendar asks, the
 * Journal takes it and clears it. Nothing persists, and the carousel keeps
 * owning the date exactly as it did before.
 *
 * Lives under hooks/ because that is where section 3 puts a feature's hooks.
 *
 * ## IT IS MOUNTED ABOVE THE TABS, NOT ON THE JOURNAL'S STACK
 *
 * It started on the Journal stack, which was enough for the calendar. The
 * Journal TAB TRIGGER also asks now — pressing it returns to today (specs
 * 14.24) — and a trigger is declared in the tabs layout, which sits above that
 * stack. A provider has to be above everyone who reads it, so it moved to the
 * root. Nothing else changes: the Journal still takes the request and clears
 * it, and nothing persists.
 */

interface RequestedDate {
  /** The day the calendar asked for, until the Journal takes it. */
  requested: LocalDate | null;
  request: (date: LocalDate) => void;
  /** Called by the Journal once it has applied the request. */
  clear: () => void;
}

const RequestedDateContext = createContext<RequestedDate | null>(null);

export function RequestedDateProvider({ children }: { children: ReactNode }) {
  const [requested, setRequested] = useState<LocalDate | null>(null);

  const value = useMemo<RequestedDate>(
    () => ({
      requested,
      request: (date) => setRequested(date),
      clear: () => setRequested(null),
    }),
    [requested],
  );

  return (
    <RequestedDateContext.Provider value={value}>{children}</RequestedDateContext.Provider>
  );
}

/**
 * Throws when the provider is missing rather than returning a silent no-op: a
 * calendar whose selection goes nowhere looks exactly like one that works, and
 * would be found by a user rather than by a developer.
 */
export function useRequestedDate(): RequestedDate {
  const value = useContext(RequestedDateContext);
  if (value === null) {
    throw new Error('useRequestedDate outside RequestedDateProvider');
  }
  return value;
}

/** Just the asking half, for the calendar screen. */
export function useRequestDate(): (date: LocalDate) => void {
  const { request } = useRequestedDate();
  return useCallback((date: LocalDate) => request(date), [request]);
}

/**
 * "Take me back to today", for the Journal tab trigger.
 *
 * ## THE CLOCK IS READ AT THE PRESS, NOT AT MOUNT
 *
 * Deliberately NOT useToday, which is frozen against the clock so that a label
 * does not move under a list when midnight goes past. This is the opposite
 * case, and it is the one the notification scheduler already settled: pressing
 * a tab to go to today is an ACT, so the day it lands on has to be the day it
 * actually is — an application left open overnight would otherwise send you to
 * yesterday and call it today.
 *
 * The cutoff still comes from the preference, so this and every other screen
 * agree on where the day starts (D3).
 */
export function useRequestToday(): () => void {
  const { request } = useRequestedDate();
  const { cutoffHour } = usePreferences();

  return useCallback(() => request(currentLocalDate(cutoffHour)), [request, cutoffHour]);
}
