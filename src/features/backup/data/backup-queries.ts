import { useMutation, useQuery } from '@tanstack/react-query';
import { getAppDatabase } from '@/core/db/app-database';
import { prepareManualCopy } from '@/core/db/backup';
import { openDatabase } from '@/core/db/client';
import { setting } from '@/core/db/schema';
import { readsFrom } from '@/core/query';
import {
  readExportReminderDays,
  readLastExportAt,
} from '@/features/settings/data/settings-reads';
import { exportFreshness, type ExportFreshness } from '../domain/export-age';
import { runExport, type ExportOutcome } from '../run-export';
import { runImport, type ImportOutcome } from '../run-import';

/**
 * Reads are hooks; writes are the orchestrations of run-export.ts and
 * run-import.ts, wrapped here for the pending and error state a screen needs
 * (D8).
 *
 * Not one onSuccess, as everywhere since slice 1. An export writes
 * last_export_at, SQLite reports that `setting` changed, and the bus
 * invalidates whatever declared reading it. An import announces itself through
 * the bus too, by the one path the update hook cannot cover — see
 * announceFullReplacement in core/db/change-bus.ts.
 */

export const backupKeys = {
  freshness: () => ['backup', 'freshness'] as const,
};

/**
 * How old the last export is (specs 5.4).
 *
 * The clock is read here rather than in the component, so that no business
 * calculation happens in the render path (conventions section 4). The value it
 * produces ages between renders, which is correct for a "days since" figure
 * and would be wrong for anything finer.
 */
export function useExportFreshness() {
  return useQuery<ExportFreshness>({
    queryKey: backupKeys.freshness(),
    queryFn: () => {
      const db = getAppDatabase();
      return exportFreshness(
        readLastExportAt(db),
        Date.now(),
        readExportReminderDays(db),
      );
    },
    meta: readsFrom(setting),
  });
}

export function useRunExport() {
  return useMutation<ExportOutcome>({
    mutationFn: () => runExport(getAppDatabase()),
  });
}

export function useRunImport() {
  return useMutation<ImportOutcome>({
    mutationFn: () => runImport(getAppDatabase()),
  });
}

/**
 * "Prepare a copy" (specs 5.4): consolidate the database so the file can be
 * copied by hand from the Files app. Takes the raw connection, not the Drizzle
 * handle, because consolidating is a PRAGMA on a connection.
 */
export function usePrepareCopy() {
  return useMutation({
    mutationFn: () => Promise.resolve(prepareManualCopy(openDatabase())),
  });
}
