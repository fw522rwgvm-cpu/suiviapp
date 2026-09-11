import { describe, expect, it } from 'vitest';
import {
  buildEnvelope,
  readEnvelope,
  type BinarySchema,
} from '../../src/features/backup/domain/envelope';
import {
  EXPORT_FORMAT_MARKER,
  EXPORT_FORMAT_VERSION,
  FORMAT_GENERATIONS,
  isSupportedFormatVersion,
} from '../../src/features/backup/domain/format-version';

/**
 * The header, and the first of the three barriers of D7.
 *
 * Worth testing because everything it decides is invisible until the day it
 * matters: an archive refused for the wrong reason is indistinguishable, from
 * the outside, from an archive accepted for the wrong reason — right up to the
 * moment the data is gone.
 */

const BINARY: BinarySchema = { tags: ['0000_initial_setting', '0001_journal'] };

function validFile(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    format: EXPORT_FORMAT_MARKER,
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: '0001_journal',
    schemaMigrationCount: 2,
    appVersion: '0.1.0',
    appVariant: 'production',
    exportedAt: 1_789_243_920_000,
    ...overrides,
  };
}

describe('export envelope', () => {
  it('writes the header in a deliberate key order', () => {
    // D7 wants a file that opens in a text editor, in a situation that is
    // already bad. What identifies the file has to come before what dates it.
    const envelope = buildEnvelope({
      schemaVersion: '0001_journal',
      schemaMigrationCount: 2,
      appVersion: '0.1.0',
      appVariant: 'production',
      exportedAt: 1_789_243_920_000,
    });

    expect(Object.keys(envelope)).toEqual([
      'format',
      'formatVersion',
      'schemaVersion',
      'schemaMigrationCount',
      'appVersion',
      'appVariant',
      'exportedAt',
    ]);
  });

  it('accepts a file written by this binary, and locates its schema', () => {
    const verdict = readEnvelope(validFile(), BINARY);

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    // The last index: nothing left to migrate through after the rows go in.
    expect(verdict.value.schemaIndex).toBe(1);
    expect(verdict.value.envelope.appVariant).toBe('production');
  });

  it('accepts an archive older than the binary, and says how much older', () => {
    // The case D7 does not settle on its own, and the reason schemaIndex is
    // returned at all: slice 6 importing a slice 2 archive rebuilds at
    // 0000, fills, then migrates forward through the rest.
    const verdict = readEnvelope(
      validFile({ schemaVersion: '0000_initial_setting', schemaMigrationCount: 1 }),
      BINARY,
    );

    expect(verdict.ok).toBe(true);
    if (!verdict.ok) return;
    expect(verdict.value.schemaIndex).toBe(0);
  });

  it('refuses anything that is not an object', () => {
    for (const value of [null, 42, 'texte', [], undefined]) {
      const verdict = readEnvelope(value, BINARY);
      expect(verdict.ok).toBe(false);
      if (verdict.ok) continue;
      expect(verdict.problems[0]?.code).toBe('not_an_object');
    }
  });

  it('refuses a JSON file that is not one of ours, without listing grievances', () => {
    // A photo library export should produce one refusal, not twenty.
    const verdict = readEnvelope({ version: 3, items: [] }, BINARY);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.problems).toHaveLength(1);
    expect(verdict.problems[0]?.code).toBe('not_a_suivi_export');
  });

  it('refuses a format version it does not know', () => {
    const verdict = readEnvelope(validFile({ formatVersion: 2 }), BINARY);

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.problems[0]).toEqual({
      code: 'format_version_unsupported',
      found: 2,
      supported: EXPORT_FORMAT_VERSION,
    });
  });

  it('refuses an archive written by a newer binary, the way G3 does', () => {
    // Same mistake as a downgrade — an old binary meeting new data — arriving
    // through the other door. schemaMigrationCount is what tells it apart from
    // a tag that is merely unknown.
    const verdict = readEnvelope(
      validFile({ schemaVersion: '0007_weight', schemaMigrationCount: 8 }),
      BINARY,
    );

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.problems[0]).toEqual({
      code: 'schema_too_recent',
      found: '0007_weight',
      binary: '0001_journal',
    });
  });

  it('refuses an unknown tag that is not ahead of the binary', () => {
    const verdict = readEnvelope(
      validFile({ schemaVersion: '0001_journal_experimental', schemaMigrationCount: 2 }),
      BINARY,
    );

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.problems[0]?.code).toBe('schema_unknown');
  });

  it('collects every bad header field instead of stopping at the first', () => {
    // The file is meant to be repairable by hand. One error per attempt is a
    // path you walk once, badly.
    const verdict = readEnvelope(
      validFile({ appVersion: 42, appVariant: '', exportedAt: 'hier' }),
      BINARY,
    );

    expect(verdict.ok).toBe(false);
    if (verdict.ok) return;
    expect(verdict.problems.map((problem) => problem.code)).toEqual([
      'header_field_invalid',
      'header_field_invalid',
      'header_field_invalid',
    ]);
  });

  it('refuses a non-integer timestamp', () => {
    // An instant is an integer of epoch milliseconds (D3). A float here would
    // mean somebody built the header from something other than a clock.
    const verdict = readEnvelope(validFile({ exportedAt: 1.5 }), BINARY);
    expect(verdict.ok).toBe(false);
  });
});

describe('format version correspondence table (D7)', () => {
  it('declares the version this binary writes', () => {
    expect(isSupportedFormatVersion(EXPORT_FORMAT_VERSION)).toBe(true);
  });

  it('never renumbers or duplicates a generation', () => {
    // An archive names its generation by number. Reusing one would make two
    // different envelopes answer to the same name, which is the one mistake
    // this table exists to prevent.
    const versions = FORMAT_GENERATIONS.map((generation) => generation.formatVersion);
    expect(new Set(versions).size).toBe(versions.length);
    expect([...versions].sort((a, b) => a - b)).toEqual(versions);
    expect(versions.at(-1)).toBe(EXPORT_FORMAT_VERSION);
  });
});
