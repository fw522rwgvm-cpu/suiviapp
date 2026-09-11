import { describe, expect, it } from 'vitest';
import { formatInstantStamp } from '../../src/core/format';
import { backupFileName } from '../../src/core/db/backup-rules';
import {
  exportFileName,
  isExportFileName,
} from '../../src/features/backup/domain/file-name';

/**
 * File naming, for backups (D6/G1) and exports (D7 — "dated and sortable").
 *
 * The property worth a test is not the spelling, it is that sorting by name is
 * sorting by age. It holds only because every field is padded, and a missing
 * pad is invisible for eleven months of the year.
 *
 * These run under three timezones like the rest of the suite, which matters
 * here: the stamp reads local calendar fields, and a stamp built from UTC
 * would put an evening export on the wrong day west of Greenwich.
 */

// 5 February 2026, 09:07:03 local time — single-digit month, day, hour,
// minute and second all at once.
const EARLY = new Date(2026, 1, 5, 9, 7, 3);
// 12 September 2026, 14:32:00 local time.
const LATER = new Date(2026, 8, 12, 14, 32, 0);

describe('instant stamp', () => {
  it('pads every field', () => {
    expect(formatInstantStamp(EARLY)).toBe('20260205-090703');
  });

  it('sorts lexically in chronological order', () => {
    expect(formatInstantStamp(EARLY) < formatInstantStamp(LATER)).toBe(true);
  });
});

describe('export file name', () => {
  it('is dated and sortable', () => {
    expect(exportFileName(LATER)).toBe('suivi-export-20260912-143200.json');
    expect(exportFileName(EARLY) < exportFileName(LATER)).toBe(true);
  });

  it('recognises its own names and nothing else', () => {
    expect(isExportFileName(exportFileName(LATER))).toBe(true);
    expect(isExportFileName('suivi-export-20260912-143200.json.txt')).toBe(false);
    expect(isExportFileName('mes-donnees.json')).toBe(false);
  });

  it('is not mistaken for a backup, and does not mistake one', () => {
    // The rotation of D6/G1 only ever deletes names it would itself have
    // produced. An export dropped in that folder must survive it, and a
    // backup must never be picked up as an archive.
    const backup = backupFileName(LATER);
    const archive = exportFileName(LATER);

    expect(backup).toBe('suivi-20260912-143200.db');
    expect(isExportFileName(backup)).toBe(false);
    expect(archive.startsWith('suivi-export-')).toBe(true);
  });
});
