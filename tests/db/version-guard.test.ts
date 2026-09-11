import { describe, expect, it } from 'vitest';
import { compareVersions } from '../../src/core/db/version-rules';

/**
 * Refusal to start on a database newer than the binary (D6/G3).
 *
 * The architecture states plainly that going back to an earlier build will
 * happen. What makes this worth a test is that the failure it prevents is
 * silent: without the guard, an older binary writes into newer tables and
 * nothing crashes at the time.
 */

// Journal timestamps, oldest first.
const V1 = 1_789_000_000_000;
const V2 = 1_790_000_000_000;
const V3 = 1_791_000_000_000;

describe('database version guard', () => {
  it('treats a database with no migrations table as fresh', () => {
    expect(compareVersions(null, [V1, V2])).toEqual({ status: 'fresh', pending: 2 });
  });

  it('reports nothing to do when the database matches the binary', () => {
    expect(compareVersions(V2, [V1, V2])).toEqual({ status: 'up_to_date' });
  });

  it('counts the migrations still to apply', () => {
    expect(compareVersions(V1, [V1, V2, V3])).toEqual({ status: 'pending', pending: 2 });
  });

  it('refuses a database written by a newer binary', () => {
    // The scenario: the daily installation ran V3, then an older ipa is
    // reinstalled after a certificate mishap.
    expect(compareVersions(V3, [V1, V2])).toEqual({
      status: 'too_recent',
      databaseWhen: V3,
      binaryWhen: V2,
    });
  });

  it('does not care about the order the binary lists its migrations in', () => {
    expect(compareVersions(V3, [V2, V1])).toMatchObject({ status: 'too_recent' });
    expect(compareVersions(V1, [V3, V1, V2])).toMatchObject({ status: 'pending', pending: 2 });
  });

  it('refuses when the binary carries no migration at all', () => {
    // Degenerate, but it must refuse rather than silently accept: a binary
    // with an empty journal is older than any database that has one.
    expect(compareVersions(V1, [])).toMatchObject({ status: 'too_recent', binaryWhen: 0 });
  });
});
