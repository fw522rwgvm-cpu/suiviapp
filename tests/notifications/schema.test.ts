import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { NOTIFICATION_KINDS } from '../../src/core/db/schema';
import { openTestDatabase, type TestDatabase } from '../helpers/database';

/**
 * What 0007 decided, pinned (schema 2.5, D14).
 *
 * The migration is one table and one CHECK, and every one of those choices was
 * a refusal of something else. The test is here for the refusals rather than
 * for the table: that the table exists is visible the moment anything reads it,
 * which is the criterion D15 uses to NOT write a test. What is invisible is a
 * constraint quietly added later "for safety", or one quietly dropped.
 */

let database: TestDatabase;

beforeEach(() => {
  database = openTestDatabase();
});

afterEach(() => {
  database.close();
});

describe('notification_setting', () => {
  it('refuses an enabled flag that is not 0 or 1', () => {
    // ck_notification_enabled, and the precedent is ck_weight_goal_active
    // verbatim: a boolean can never widen, so constraining it costs nothing,
    // ever. This is the one CHECK the table carries.
    expect(() =>
      database.raw
        .prepare('INSERT INTO notification_setting (kind, enabled) VALUES (?, ?)')
        .run('weigh_in', 2),
    ).toThrow(/ck_notification_enabled|CHECK/);
  });

  it('ACCEPTS an unknown kind, which is the decision rather than a gap', () => {
    // NO CHECK ON kind, and this test exists so that adding one is a deliberate
    // act with a failing test attached rather than a tidy-up.
    //
    // The line slice 3 drew is not how likely a set is to move but WHAT
    // WIDENING IT WOULD BREAK. journal_entry.kind carries a CHECK because
    // widening it breaks the clauseless SUM; weight_goal.mode because it
    // decides which column is read. Neither holds here: nothing is summed and
    // nothing is derived, and the Settings screen enumerates the four kinds
    // from the CODE while reading this table by key. A row with an unknown kind
    // is a row nothing reads.
    //
    // And widening is FORESEEN — slice 11 puts the rest timer on a local
    // notification. A CHECK would make that a table rebuild.
    //
    // The barrier is the export catalogue's one_of rule, which runs before the
    // first insert and names the row (see table-catalog).
    expect(() =>
      database.raw
        .prepare('INSERT INTO notification_setting (kind, enabled) VALUES (?, ?)')
        .run('rest_timer', 1),
    ).not.toThrow();
  });

  it('ACCEPTS an hour outside 0..23, because clamping is what reads it', () => {
    // NO CHECK ON hour OR minute, and this is the refusal. SQLite would allow
    // one here where `setting` never could, being key/value TEXT — but the
    // possibility does not change the criterion. This project answers a bad
    // settings value by CLAMPING, on the way in and on the way out, exactly as
    // normalizeCutoffHour does. A settings row is never a reason to refuse to
    // work, and an archive repaired by hand must import rather than fail.
    expect(() =>
      database.raw
        .prepare(
          'INSERT INTO notification_setting (kind, enabled, hour, minute) VALUES (?, ?, ?, ?)',
        )
        .run('weigh_in', 1, 25, 99),
    ).not.toThrow();
  });

  it('holds at most one row per kind', () => {
    // `kind` is the PRIMARY KEY, so "one setting per kind" is not a rule the
    // write layer applies — there is nowhere else for a second row to go. The
    // same shape weight_measure.date has.
    const insert = database.raw.prepare(
      'INSERT INTO notification_setting (kind, enabled) VALUES (?, ?)',
    );
    insert.run('weigh_in', 1);
    expect(() => insert.run('weigh_in', 0)).toThrow(/UNIQUE|PRIMARY/i);
  });

  it('carries no foreign key in either direction', () => {
    // The property that let slice 8 defer this table without taking any risk
    // (amendment 9.9 no 1): 0007 creates it whole, rebuilding nothing. Asserted
    // rather than left to the comment, both ways round.
    const outgoing = database.raw
      .prepare('PRAGMA foreign_key_list(notification_setting)')
      .all();
    expect(outgoing).toEqual([]);

    const tables = database.raw
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
      )
      .all() as { name: string }[];
    const referencing = tables.filter((table) =>
      (
        database.raw.prepare(`PRAGMA foreign_key_list("${table.name}")`).all() as {
          table: string;
        }[]
      ).some((key) => key.table === 'notification_setting'),
    );
    expect(referencing).toEqual([]);
  });

  it('starts empty, because an absent row and a disabled one say the same thing', () => {
    // NO ROWS ARE SEEDED. The reader returns the kind's default for both an
    // absent row and enabled = 0, so seeding four rows would be four rows that
    // state nothing — and an installation that never opens the screen carries
    // nothing in its export.
    const rows = database.raw
      .prepare('SELECT COUNT(*) AS n FROM notification_setting')
      .get() as { n: number };
    expect(rows.n).toBe(0);
  });

  it('declares exactly the four kinds specs 9.3 tabulates', () => {
    // Data first, type derived — the shape PORTION_NAMES set. The type cannot
    // be walked at runtime, so this is what keeps the pair honest, and the
    // place it would otherwise drift is the import validator.
    expect([...NOTIFICATION_KINDS]).toEqual([
      'weigh_in',
      'empty_journal',
      'daily_summary',
      'export_reminder',
    ]);
  });
});
