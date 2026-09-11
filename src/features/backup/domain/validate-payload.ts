/**
 * Barriers one and two of D7, both entirely before the first insertion.
 *
 * > Three validation barriers, all before the switch: incompatible format
 * > version refused; complete structural validation of the payload;
 * > referential integrity check.
 *
 * Barrier three needs a database to run foreign_key_check against, so it lives
 * in build-database.ts. Everything here is pure: a value in, a verdict out.
 *
 * D15 asks for "strict validation at both entry boundaries: JSON import and
 * Open Food Facts responses", and this is the first of the two. It is written
 * by hand rather than declared with zod, and that is a decision, not an
 * omission: the payload is not foreign. Its columns are already described by
 * the Drizzle objects the migrations are generated from. A zod schema would be
 * a SECOND declaration of the same schema, maintained by hand, free to drift
 * from the first — inside the validator of the only safety net the project
 * has. So the expectations are derived from the schema instead, and only the
 * constraints SQL cannot express are declared (see table-catalog.ts).
 *
 * Every problem is collected. The file is meant to be repairable by hand —
 * that is why D7 refuses compression — and repairing it one error per attempt
 * is a path you walk once, badly.
 */

import { parseLocalDate } from '@/core/date';
import { toEntityId } from '@/core/id';
import type { EntityId } from '@/core/id';
import { readEnvelope, type BinarySchema } from './envelope';
import type { ExportEnvelope, ExportRow, ExportValue } from './envelope-types';
import { accept, type ImportProblem, type Verdict } from './problems';
import { exportedTables, type ExportColumn, type ExportedTable } from './table-catalog';

export interface ValidatedPayload {
  envelope: ExportEnvelope;
  /** Position of the archive's schema tag in the binary's journal. */
  schemaIndex: number;
  /**
   * Rows, by SQL table name, for every table of the catalogue.
   *
   * Tables the archive predates are present and empty, so the builder never
   * has to ask whether a key was missing on purpose.
   */
  rows: Record<string, readonly ExportRow[]>;
}

/** Stops the list growing without bound on a file that is wrong throughout. */
const MAX_PROBLEMS = 200;

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isExportValue(value: unknown): value is ExportValue {
  return value === null || typeof value === 'string' || typeof value === 'number';
}

/**
 * Checks one value against its column.
 *
 * Returns the value to keep, or undefined when the column is to be left out of
 * the insert entirely so SQLite applies its default.
 */
function checkValue(
  table: string,
  index: number,
  column: ExportColumn,
  row: Record<string, unknown>,
  problems: ImportProblem[],
): { keep: boolean; value: ExportValue } {
  const present = Object.prototype.hasOwnProperty.call(row, column.name);

  if (!present) {
    // An archive older than the binary legitimately lacks a column added by a
    // later migration. SQLite does the reasoning for us: ALTER TABLE ADD
    // COLUMN cannot add a NOT NULL column without a default. So a missing
    // column that is nullable, or has a default, is an old archive; a missing
    // column that is NOT NULL without a default is a broken row.
    if (column.notNull && !column.hasDefault) {
      problems.push({ code: 'column_missing', table, index, column: column.name });
      return { keep: false, value: null };
    }
    return { keep: false, value: null };
  }

  const raw = row[column.name];

  if (!isExportValue(raw)) {
    problems.push({
      code: 'column_type',
      table,
      index,
      column: column.name,
      expected: column.kind,
      found: undefined,
    });
    return { keep: false, value: null };
  }

  if (raw === null) {
    if (column.notNull) {
      problems.push({ code: 'column_null', table, index, column: column.name });
      return { keep: false, value: null };
    }
    return { keep: true, value: null };
  }

  if (column.kind === 'text') {
    if (typeof raw !== 'string') {
      problems.push({
        code: 'column_type',
        table,
        index,
        column: column.name,
        expected: 'text',
        found: raw,
      });
      return { keep: false, value: null };
    }
  } else {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) {
      problems.push({
        code: 'column_type',
        table,
        index,
        column: column.name,
        expected: column.kind,
        found: raw,
      });
      return { keep: false, value: null };
    }
    // An INTEGER column holding a fraction is not something this application
    // ever writes: positions are counters and the rest are epoch milliseconds.
    // SQLite would store it happily, which is exactly why it is checked here.
    if (column.kind === 'integer' && !Number.isInteger(raw)) {
      problems.push({
        code: 'value_malformed',
        table,
        index,
        column: column.name,
        expected: 'integer',
        found: raw,
      });
      return { keep: false, value: null };
    }
  }

  checkRule(table, index, column, raw, problems);
  return { keep: true, value: raw };
}

/** The constraints SQL does not carry (table-catalog.ts declares them). */
function checkRule(
  table: string,
  index: number,
  column: ExportColumn,
  value: ExportValue,
  problems: ImportProblem[],
): void {
  const rule = column.value;
  if (rule === null || value === null) return;

  switch (rule.rule) {
    case 'civil_date':
      // Goes through core/date, the single entry point of D3. A string that
      // merely looks like a date — 2026-02-30 — is not one.
      if (typeof value !== 'string' || parseLocalDate(value) === null) {
        problems.push({
          code: 'value_malformed',
          table,
          index,
          column: column.name,
          expected: 'civil date',
          found: value,
        });
      }
      return;

    case 'entity_id':
      if (typeof value !== 'string' || toEntityId<EntityId<string>>(value) === null) {
        problems.push({
          code: 'value_malformed',
          table,
          index,
          column: column.name,
          expected: 'entity id',
          found: value,
        });
      }
      return;

    case 'epoch_ms':
      // Already known to be an integer by the time we get here; what is left
      // to refuse is a negative one, which would be a date before 1970 and so
      // a corrupted field rather than a very old meal.
      if (typeof value !== 'number' || value < 0) {
        problems.push({
          code: 'value_malformed',
          table,
          index,
          column: column.name,
          expected: 'integer',
          found: value,
        });
      }
      return;

    case 'one_of':
      if (typeof value !== 'string' || !rule.allowed.includes(value)) {
        problems.push({
          code: 'value_not_in_set',
          table,
          index,
          column: column.name,
          found: value,
          allowed: rule.allowed,
        });
      }
      return;
  }
}

function validateTable(
  descriptor: ExportedTable,
  raw: unknown,
  problems: ImportProblem[],
): ExportRow[] {
  if (!Array.isArray(raw)) {
    problems.push({ code: 'table_not_an_array', table: descriptor.name });
    return [];
  }

  const known = new Set(descriptor.columns.map((column) => column.name));
  const seen = new Set<string>();
  const rows: ExportRow[] = [];

  raw.forEach((candidate, index) => {
    if (problems.length >= MAX_PROBLEMS) return;

    if (!isPlainObject(candidate)) {
      problems.push({ code: 'row_not_an_object', table: descriptor.name, index });
      return;
    }

    for (const key of Object.keys(candidate)) {
      if (!known.has(key)) {
        // Cannot be a newer schema: barrier one already refused those. So it
        // is corruption, or an edit by hand that went wrong.
        problems.push({
          code: 'column_unknown',
          table: descriptor.name,
          index,
          column: key,
        });
      }
    }

    const row: ExportRow = {};
    for (const column of descriptor.columns) {
      const checked = checkValue(descriptor.name, index, column, candidate, problems);
      if (checked.keep) {
        row[column.name] = checked.value;
      }
    }

    const key = descriptor.primaryKey
      .map((name) => String(row[name] ?? ''))
      .join(' ');
    if (seen.has(key)) {
      // SQLite would refuse this at INSERT, but by then rows are already in
      // and the message names a constraint rather than a line in the file.
      problems.push({
        code: 'primary_key_duplicated',
        table: descriptor.name,
        index,
        key: key.replace(' ', ', '),
      });
    }
    seen.add(key);

    rows.push(row);
  });

  return rows;
}

/**
 * Barriers one and two. Nothing is written, nothing is opened.
 *
 * @param value the parsed JSON of the archive
 * @param binary every migration tag this binary carries, in journal order
 */
export function validateImportFile(
  value: unknown,
  binary: BinarySchema,
): Verdict<ValidatedPayload> {
  const header = readEnvelope(value, binary);
  if (!header.ok) return header;

  // readEnvelope has already established this is an object.
  const file = value as Record<string, unknown>;
  const tables = file['tables'];

  if (!isPlainObject(tables)) {
    return { ok: false, problems: [{ code: 'tables_not_an_object' }] };
  }

  const problems: ImportProblem[] = [];
  const catalogue = exportedTables();
  const known = new Set(catalogue.map((descriptor) => descriptor.name));

  for (const key of Object.keys(tables)) {
    if (!known.has(key)) {
      problems.push({ code: 'table_unknown', table: key });
    }
  }

  const rows: Record<string, readonly ExportRow[]> = {};

  for (const descriptor of catalogue) {
    const present = Object.prototype.hasOwnProperty.call(tables, descriptor.name);

    if (!present) {
      // Absent is only acceptable when the archive predates the table. The
      // comparison is on journal position, so it stays right as the journal
      // grows and never depends on tag spelling.
      const introducedAt = binary.tags.indexOf(descriptor.introducedIn);
      if (introducedAt !== -1 && introducedAt <= header.value.schemaIndex) {
        problems.push({ code: 'table_missing', table: descriptor.name });
      }
      rows[descriptor.name] = [];
      continue;
    }

    rows[descriptor.name] = validateTable(descriptor, tables[descriptor.name], problems);
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return accept({
    envelope: header.value.envelope,
    schemaIndex: header.value.schemaIndex,
    rows,
  });
}
