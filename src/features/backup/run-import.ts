import { File } from 'expo-file-system';
import type { AppDatabase } from '@/core/db/database';
import bundle from '@/core/db/migrations/bundle.generated';
import { recordImportedArchive } from '@/features/settings/data/settings-writes';
import { journalTags } from './domain/migration-prefix';
import type { ImportProblem } from './domain/problems';
import { validateImportFile } from './domain/validate-payload';
import { replaceDatabase, type SwapOutcome } from './swap';

/**
 * Importing an archive, from the picker to the switch (specs 5.4, D7).
 *
 * > The import replaces the database entirely. No merge is offered. The
 * > operation is atomic: the current database stays intact until the final
 * > switch.
 *
 * The native half: the picker and reading the bytes. Everything that decides
 * whether the file is acceptable is in domain/, and the switch is in swap.ts.
 *
 * NO expo-document-picker. expo-file-system 57 carries File.pickFileAsync,
 * which opens the same iOS picker and, on iOS, hands back a temporary copy
 * leaving the original untouched. Section 5 authorises the extra dependency;
 * not needing it is one native dependency fewer, for good.
 */

export type ImportOutcome =
  | { status: 'cancelled' }
  | { status: 'unreadable'; message: string }
  | { status: 'refused'; problems: readonly ImportProblem[] }
  | ({ status: 'replaced' } & SwapOutcome);

/**
 * The archive's own timestamp, read back before the switch discards the
 * payload. Used to date the freshly imported database.
 */
function readExportedAt(value: unknown): number | null {
  if (typeof value !== 'object' || value === null) return null;
  const at = (value as Record<string, unknown>)['exportedAt'];
  return typeof at === 'number' && Number.isInteger(at) && at >= 0 ? at : null;
}

export async function runImport(db: AppDatabase): Promise<ImportOutcome> {
  let text: string;

  try {
    // 'application/json' rather than '*/*': the picker is the first filter,
    // and it costs nothing. An archive renamed by the user still imports —
    // it is the header that identifies a file, never its name.
    const picked = await File.pickFileAsync({ mimeTypes: ['application/json'] });
    if (picked.canceled) return { status: 'cancelled' };

    text = picked.result.textSync();
  } catch (error) {
    return {
      status: 'unreadable',
      message: error instanceof Error ? error.message : String(error),
    };
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    // Not a structured refusal: there is no payload to complain about yet.
    // D7 wants the file repairable by hand, and "the JSON does not parse" is
    // the one message a text editor can act on directly.
    return { status: 'unreadable', message: "Ce fichier n'est pas du JSON valide." };
  }

  // Barriers one and two, entirely before anything is opened or written.
  const validated = validateImportFile(parsed, { tags: journalTags(bundle) });
  if (!validated.ok) return { status: 'refused', problems: validated.problems };

  // Barrier three lives inside, and so does the switch. Until it returns, the
  // current database has not been touched.
  const swapped = await replaceDatabase(validated.value);
  if (!swapped.ok) return { status: 'refused', problems: swapped.problems };

  // The imported `setting` rows carry the EXPORTING device's last_export_at,
  // which is one export cycle stale by construction. This data demonstrably
  // exists in a file outside the device, dated by the archive's own header —
  // so that is what the age indicator should say.
  const exportedAt = readExportedAt(parsed);
  if (exportedAt !== null) {
    recordImportedArchive(db, exportedAt);
  }

  return { status: 'replaced', ...swapped.value };
}
