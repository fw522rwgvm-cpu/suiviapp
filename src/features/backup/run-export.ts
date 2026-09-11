import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import type { AppDatabase } from '@/core/db/database';
import bundle from '@/core/db/migrations/bundle.generated';
import { recordExport } from '@/features/settings/data/settings-writes';
import {
  buildExportFile,
  countExportedRows,
  serializeExportFile,
} from './domain/export-payload';
import { exportFileName } from './domain/file-name';

/**
 * Producing the archive and handing it to the share sheet (specs 5.4, D7).
 *
 * > Triggered manually from Settings, shared through the iOS share sheet.
 *
 * The native half. Everything that decides WHAT goes in the file is in
 * domain/, tested in Node; this module only writes bytes and opens a sheet.
 */

export type ExportOutcome =
  | { status: 'shared'; fileName: string; rows: number; bytes: number }
  /** The share sheet is unavailable. The file exists; it just cannot travel. */
  | { status: 'sharing_unavailable'; fileName: string }
  | { status: 'failed'; message: string };

/**
 * Where the archive is written: the cache, not Documents.
 *
 * Documents is visible in the Files app and is where the pre-migration backups
 * live, which makes it tempting. It is the wrong place: D15 is explicit that
 * no real export ever lingers, and an archive sitting in a folder the user
 * browses is one they will eventually mistake for the backup it is not. The
 * share sheet is the way out, and an export nobody sends anywhere was never a
 * backup in the first place.
 *
 * The cost, stated: iOS may purge the cache under storage pressure. Between
 * writing the file and presenting the sheet that is not a practical risk, and
 * afterwards the copy that matters is wherever the user sent it.
 */
function targetFile(now: Date): File {
  return new File(Paths.cache, exportFileName(now));
}

export async function runExport(
  db: AppDatabase,
  now: Date = new Date(),
): Promise<ExportOutcome> {
  try {
    const config = Constants.expoConfig;
    const entries = [...bundle.journal.entries].sort((a, b) => a.idx - b.idx);

    const file = buildExportFile(db, {
      schemaVersion: entries.at(-1)?.tag ?? '',
      schemaMigrationCount: entries.length,
      appVersion: config?.version ?? 'inconnue',
      // Says which container an archive came from, which is the first thing
      // worth knowing when two installations hold two different histories.
      appVariant: String(config?.extra?.['variant'] ?? 'inconnue'),
      exportedAt: now.getTime(),
    });

    const text = serializeExportFile(file);
    const target = targetFile(now);

    // A file from an earlier export in the same second would otherwise make
    // create() throw.
    if (target.exists) target.delete();
    target.create();
    target.write(text);

    if (!(await Sharing.isAvailableAsync())) {
      return { status: 'sharing_unavailable', fileName: target.name };
    }

    await Sharing.shareAsync(target.uri, {
      mimeType: 'application/json',
      UTI: 'public.json',
      dialogTitle: 'Exporter les données',
    });

    // Recorded only now, and this is the honest limit of what can be known:
    // iOS does not say whether the user actually saved the file anywhere, only
    // that the sheet was dismissed. Recording it any earlier would let a
    // cancelled export reset the age indicator — and that indicator is the one
    // number in the application that must never mislead in the reassuring
    // direction.
    recordExport(db, now.getTime());

    return {
      status: 'shared',
      fileName: target.name,
      rows: countExportedRows(file),
      bytes: text.length,
    };
  } catch (error) {
    return {
      status: 'failed',
      message: error instanceof Error ? error.message : String(error),
    };
  }
}
