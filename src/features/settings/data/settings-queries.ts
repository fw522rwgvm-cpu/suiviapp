import { useMutation, useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';
import { currentLocalDate, type LocalDate } from '@/core/date';
import { getAppDatabase } from '@/core/db/app-database';
import { setting } from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import type { ThemePreference } from '@/core/theme/tokens';
import type { Preferences } from '../domain/preferences';
import { readPreferences } from './settings-reads';
import {
  writeAdherenceTolerancePct,
  writeCutoffHour,
  writeThemePreference,
} from './settings-writes';

/**
 * Reads are hooks; writes are the functions of settings-writes.ts (D8).
 *
 * Not one onSuccess, as everywhere since slice 1. A write touches `setting`,
 * SQLite reports it, and the bus invalidates whatever declared reading that
 * table — which is this query and the export freshness one, and nothing has to
 * know that.
 */

export const settingsKeys = {
  preferences: () => ['settings', 'preferences'] as const,
};

/**
 * The three preferences, available on the FIRST render.
 *
 * ## WHY initialData, AND WHY IT IS NOT A SHORTCUT
 *
 * A plain useQuery returns `data: undefined` on the render that mounts it,
 * however synchronous its queryFn. For a preference that is fatal rather than
 * untidy:
 *
 *  - the Journal freezes its idea of today in its INITIAL state, so a cutoff
 *    arriving one tick later would be read after the date it decides has
 *    already been chosen;
 *  - the theme decides what colour the first frame is painted, so a late value
 *    is a flash.
 *
 * This application has met that defect twice already — the quantity wheels
 * that spun as they opened, and the carousel whose key changed in an effect —
 * and the answer both times was the same: the value has to exist before the
 * thing that needs it. `initialData` is that answer here, and it is honest
 * rather than optimistic: the database is local, synchronous, and known open
 * (this runs below the gate), so it is a real read and not a guess to be
 * corrected later.
 *
 * It costs nothing on top. The query client sets staleTime Infinity — there is
 * no other writer, so nothing goes stale on its own — which means the seeded
 * data is not refetched on mount. Only an invalidation from the bus re-reads.
 */
export function usePreferences(): Preferences {
  const { data } = useQuery({
    queryKey: settingsKeys.preferences(),
    queryFn: () => readPreferences(getAppDatabase()),
    initialData: () => readPreferences(getAppDatabase()),
    meta: readsFrom(setting),
  });

  return data;
}

/**
 * The day the application considers current (D3, specs 8.2).
 *
 * > A single function decides what today is, cutoff included, and serves the
 * > whole application.
 *
 * That function is still currentLocalDate. This only carries the setting to
 * it, which is the piece that was missing: the cutoff has existed as a
 * parameter since slice 0 and nothing ever passed anything but the default.
 *
 * ## FROZEN AGAINST THE CLOCK, LIVE AGAINST THE SETTING
 *
 * The clock is read when the component mounts and when the cutoff changes, not
 * on every render. That is the behaviour the callers already documented and
 * relied on: a label must not change under a list because midnight went past
 * while it was open, and two screens holding their own copy can only differ
 * across a midnight, where both are right about their own moment.
 *
 * Changing the setting, on the other hand, must be felt at once — it is an act,
 * not the passage of time. Hence the dependency: useMemo re-reads the clock
 * exactly when the answer might legitimately have changed.
 */
export function useToday(): LocalDate {
  const { cutoffHour } = usePreferences();
  return useMemo(() => currentLocalDate(cutoffHour), [cutoffHour]);
}

export function useSetTheme() {
  return useMutation({
    mutationFn: (preference: ThemePreference) =>
      Promise.resolve(writeThemePreference(getAppDatabase(), preference)),
  });
}

export function useSetCutoffHour() {
  return useMutation({
    mutationFn: (hour: number) =>
      Promise.resolve(writeCutoffHour(getAppDatabase(), hour)),
  });
}

export function useSetAdherenceTolerance() {
  return useMutation({
    mutationFn: (percent: number) =>
      Promise.resolve(writeAdherenceTolerancePct(getAppDatabase(), percent)),
  });
}
