import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  manualCopyFileName,
  selectBackupsToDelete,
  selectLatestBackup,
  selectLatestManualCopy,
  selectManualCopiesToDelete,
} from '../../src/core/db/backup-rules';

/**
 * Naming and rotation of the pre-migration backups (D6/G1).
 *
 * Rotation deletes files. Getting the ordering wrong would quietly keep the
 * three oldest copies and delete every recent one, which looks exactly like
 * working rotation until the day a backup is actually needed.
 */

describe('backup naming', () => {
  it('names a backup so that sorting by name sorts by age', () => {
    const january = backupFileName(new Date(2026, 0, 5, 7, 3, 9));
    const december = backupFileName(new Date(2026, 11, 31, 23, 59, 59));
    expect(january).toBe('suivi-20260105-070309.db');
    expect(december).toBe('suivi-20261231-235959.db');
    expect([december, january].sort()).toEqual([january, december]);
  });

  it('pads every field, so no name is shorter than another', () => {
    // An unpadded month would sort '2026-9' after '2026-10' and break rotation.
    const name = backupFileName(new Date(2026, 8, 1, 0, 0, 0));
    expect(name).toBe('suivi-20260901-000000.db');
  });
});

describe('backup rotation', () => {
  const names = [
    'suivi-20260101-100000.db',
    'suivi-20260102-100000.db',
    'suivi-20260103-100000.db',
    'suivi-20260104-100000.db',
    'suivi-20260105-100000.db',
  ];

  it('keeps the three most recent copies', () => {
    expect(selectBackupsToDelete(names)).toEqual([
      'suivi-20260102-100000.db',
      'suivi-20260101-100000.db',
    ]);
  });

  it('deletes nothing when there are three or fewer', () => {
    expect(selectBackupsToDelete(names.slice(0, 3))).toEqual([]);
    expect(selectBackupsToDelete([])).toEqual([]);
  });

  it('never touches a file it did not create', () => {
    // The Documents folder is open to the user through the Files app, so it may
    // well contain an export, a note, or anything else they put there.
    const foreign = ['export-2026.json', 'suivi.db', 'notes.txt', 'Suivi-manuel.db'];
    expect(selectBackupsToDelete([...names, ...foreign])).toEqual([
      'suivi-20260102-100000.db',
      'suivi-20260101-100000.db',
    ]);
  });

  it('finds the most recent copy to name on the refusal screen', () => {
    expect(selectLatestBackup(names)).toBe('suivi-20260105-100000.db');
    expect(selectLatestBackup(['notes.txt'])).toBeNull();
    expect(selectLatestBackup([])).toBeNull();
  });
});

/**
 * Manual copies, from the "prepare a copy" button (specs 5.4, slice 2).
 *
 * Same folder as the automatic backups, distinct prefix, independent rotation.
 * The property worth a test is the one that would be silent if it broke: a
 * manual copy must never evict a pre-migration backup, because the automatic
 * one is the copy nobody chose to take.
 */
describe('manual copies alongside the automatic backups', () => {
  const stamp = (day: number) => new Date(2026, 8, day, 10, 0, 0);

  it('is named apart from an automatic backup', () => {
    expect(manualCopyFileName(stamp(12))).toBe('suivi-copy-20260912-100000.db');
    expect(backupFileName(stamp(12))).toBe('suivi-20260912-100000.db');
  });

  it('never evicts a pre-migration backup, however many are taken', () => {
    const automatic = [1, 2, 3].map((day) => backupFileName(stamp(day)));
    const manual = [4, 5, 6, 7, 8].map((day) => manualCopyFileName(stamp(day)));
    const all = [...automatic, ...manual];

    // The automatic rotation sees three copies and deletes none of them.
    expect(selectBackupsToDelete(all)).toEqual([]);
    // The manual rotation deletes only its own, keeping three.
    expect(selectManualCopiesToDelete(all)).toHaveLength(2);
    expect(
      selectManualCopiesToDelete(all).every((name) => name.startsWith('suivi-copy-')),
    ).toBe(true);
  });

  it('does not mistake a manual copy for the backup named on the G3 screen', () => {
    const manual = manualCopyFileName(stamp(12));
    const automatic = backupFileName(stamp(9));
    expect(selectLatestBackup([manual, automatic])).toBe(automatic);
  });

  it('leaves an export or a stray file in the folder alone', () => {
    // Documents is open to the user through the Files app, so it may hold
    // anything they put there.
    const others = ['suivi-export-20260912-100000.json', 'notes.txt', 'photo.heic'];
    expect(selectBackupsToDelete(others, 0)).toEqual([]);
    expect(selectManualCopiesToDelete(others, 0)).toEqual([]);
  });

  it('names the most recent manual copy back to the user', () => {
    const manual = [4, 5, 6].map((day) => manualCopyFileName(stamp(day)));
    expect(selectLatestManualCopy([...manual, backupFileName(stamp(9))])).toBe(
      manualCopyFileName(stamp(6)),
    );
  });
});
