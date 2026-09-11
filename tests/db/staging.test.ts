import { describe, expect, it } from 'vitest';
import {
  DATABASE_NAME,
  STAGING_DATABASE_NAME,
  STAGING_FILE_SUFFIXES,
  stagingFileNames,
} from '../../src/core/db/database-files';
import {
  BACKUP_DIRECTORY_NAME,
  selectBackupsToDelete,
} from '../../src/core/db/backup-rules';
import { isExportFileName } from '../../src/features/backup/domain/file-name';

/**
 * Naming of the receiving database of an import (D7).
 *
 * Only the naming is testable here, and it is imported from database-files.ts
 * rather than from staging.ts for exactly that reason: staging.ts reaches for
 * expo-file-system and expo-sqlite, so it runs nowhere but the device. Stated
 * plainly rather than mocked — a mocked filesystem would prove the mock works.
 */

describe('receiving database naming', () => {
  it('is never the real database', () => {
    // The one mistake that would be fatal: cleaning up the leftovers of an
    // interrupted import by deleting the database.
    for (const name of stagingFileNames()) {
      expect(name).not.toBe(DATABASE_NAME);
      expect(name.startsWith(`${DATABASE_NAME}-`)).toBe(false);
    }
  });

  it('covers the three files SQLite can leave in WAL mode', () => {
    // Deleting only the main file leaves a -wal holding committed pages of a
    // half-built import. The next import opens the same name, SQLite finds an
    // orphaned log, and recovers rows from the previous attempt into what is
    // meant to be an empty database.
    expect(STAGING_FILE_SUFFIXES).toEqual(['', '-wal', '-shm']);
    expect(stagingFileNames()).toEqual([
      STAGING_DATABASE_NAME,
      `${STAGING_DATABASE_NAME}-wal`,
      `${STAGING_DATABASE_NAME}-shm`,
    ]);
  });

  it('is not mistaken for a backup or for an archive', () => {
    // The backup rotation only deletes names it would itself have produced,
    // and the import picker only offers archives. The scaffolding is neither.
    for (const name of stagingFileNames()) {
      expect(selectBackupsToDelete([name], 0)).toEqual([]);
      expect(isExportFileName(name)).toBe(false);
    }
    expect(STAGING_DATABASE_NAME.includes(BACKUP_DIRECTORY_NAME)).toBe(false);
  });
});
