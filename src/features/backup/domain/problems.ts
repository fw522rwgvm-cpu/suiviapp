/**
 * Everything an import can refuse, as data rather than as a message (D7).
 *
 * Three reasons this is a discriminated union of codes and not a list of
 * strings:
 *
 *  - Conventions section 4: code and comments in English, French reserved for
 *    displayed strings, colocated in their domain. A validator that returned
 *    French would put the interface's language in the middle of the domain.
 *  - An expected failure is a value, not an exception (section 4 again). A
 *    malformed archive is the most expected failure in this whole slice.
 *  - The three barriers of D7 must report EVERY problem, not the first. The
 *    file is meant to be repairable by hand — that is why D7 refuses
 *    compression — and repairing it one error per attempt is a path you walk
 *    once, badly.
 *
 * Every problem that concerns a row carries its table and its index, so the
 * message can name a place in a file the user is expected to open.
 */

import type { ExportValue } from './envelope-types';

export type ImportProblem =
  // Barrier 1 — version.
  | { code: 'not_an_object' }
  | { code: 'not_a_suivi_export'; found: unknown }
  | { code: 'format_version_unsupported'; found: unknown; supported: number }
  | { code: 'header_field_invalid'; field: string; found: unknown }
  | { code: 'schema_unknown'; found: string }
  | { code: 'schema_too_recent'; found: string; binary: string }
  // Barrier 2 — structure.
  | { code: 'tables_not_an_object' }
  | { code: 'table_missing'; table: string }
  | { code: 'table_unknown'; table: string }
  | { code: 'table_not_an_array'; table: string }
  | { code: 'row_not_an_object'; table: string; index: number }
  | { code: 'column_missing'; table: string; index: number; column: string }
  | { code: 'column_unknown'; table: string; index: number; column: string }
  | {
      code: 'column_type';
      table: string;
      index: number;
      column: string;
      expected: string;
      found: ExportValue | undefined;
    }
  | { code: 'column_null'; table: string; index: number; column: string }
  | {
      code: 'value_malformed';
      table: string;
      index: number;
      column: string;
      expected: 'civil date' | 'entity id' | 'integer' | 'finite number';
      found: ExportValue;
    }
  | {
      code: 'value_not_in_set';
      table: string;
      index: number;
      column: string;
      found: ExportValue;
      allowed: readonly string[];
    }
  | { code: 'primary_key_duplicated'; table: string; index: number; key: string }
  // Barrier 3 — referential integrity, reported after the rows are in place.
  | { code: 'foreign_key_violated'; table: string; count: number }
  | { code: 'denormalised_date_mismatch'; count: number };

/**
 * The verdict of a barrier. Deliberately not a thrown error: a refusal is the
 * normal outcome of handing the application someone else's file.
 */
export type Verdict<T> =
  | { ok: true; value: T }
  | { ok: false; problems: readonly ImportProblem[] };

export function refuse<T>(...problems: ImportProblem[]): Verdict<T> {
  return { ok: false, problems };
}

export function accept<T>(value: T): Verdict<T> {
  return { ok: true, value };
}
