/**
 * Reading the whole database out as one JSON value (D7).
 *
 * > Flat format, one array per entity, modelled on the tables. Uncompressed
 * > and indented.
 * > Why flat: restoring becomes mechanical. By the time you are importing you
 * > are already in a losing situation: you do not want a reconstruction
 * > algorithm, you want a dumb loop that cannot get it wrong.
 *
 * Nothing here touches a file or a native module. It takes the database as a
 * parameter, like every access function since slice 1, so the export runs
 * against a real SQLite file in Node — which is what makes the round trip of
 * D15 testable off the device at all.
 */

import { asc } from 'drizzle-orm';
import type { AppDatabase } from '@/core/db/database';
import { buildEnvelope, type EnvelopeInput } from './envelope';
import type { ExportFile, ExportRow, ExportValue } from './envelope-types';
import { exportedTables, type ExportedTable } from './table-catalog';

/**
 * A value coming back from SQLite.
 *
 * Not a validation boundary: this reads OUR database, whose column types we
 * declared. Anything else is a programming error rather than an expected
 * failure, so it throws — conventions section 4 reserves return values for
 * failures that are part of the domain, and "our own schema grew a BLOB" is
 * not one of them. Throwing here also means it can never be written to a file
 * and discovered a year later.
 */
function toExportValue(table: string, column: string, value: unknown): ExportValue {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      // Infinity and NaN have no JSON spelling: JSON.stringify writes them as
      // null, which would silently turn a broken number into a missing one.
      throw new Error(`${table}.${column} holds a non-finite number`);
    }
    return value;
  }
  throw new Error(`${table}.${column} holds an unexportable ${typeof value}`);
}

function readTable(db: AppDatabase, descriptor: ExportedTable): ExportRow[] {
  // Keyed by SQL name, so the rows come back spelled the way the file spells
  // them and no second mapping exists to disagree with the catalogue.
  const projection: Record<string, ExportedTable['columns'][number]['column']> = {};
  for (const column of descriptor.columns) {
    projection[column.name] = column.column;
  }

  // Ordered by primary key so two exports of the same data are the same file.
  // Without it the order is whatever SQLite felt like, and diffing two
  // archives — the cheapest way to answer "did anything change?" — stops
  // working.
  const order = descriptor.columns
    .filter((column) => column.isPrimaryKey)
    .map((column) => asc(column.column));

  const rows = db.select(projection).from(descriptor.table).orderBy(...order).all();

  return rows.map((row) => {
    // Rebuilt rather than passed through, so key order inside a row is the
    // catalogue's order — that is, the schema's declaration order — on every
    // driver, rather than whatever the driver happened to produce.
    const out: ExportRow = {};
    for (const column of descriptor.columns) {
      out[column.name] = toExportValue(descriptor.name, column.name, row[column.name]);
    }
    return out;
  });
}

/**
 * The whole database as one value, header included.
 *
 * Every table of the catalogue appears, empty ones included. An absent key and
 * an empty array would otherwise be the same thing to read and two different
 * things to write, and the importer would have to guess which.
 */
export function buildExportFile(db: AppDatabase, envelope: EnvelopeInput): ExportFile {
  const tables: Record<string, ExportRow[]> = {};
  for (const descriptor of exportedTables()) {
    tables[descriptor.name] = readTable(db, descriptor);
  }

  return { ...buildEnvelope(envelope), tables };
}

/**
 * The file's bytes.
 *
 * Two spaces of indentation, and no compression, because D7 says a safety net
 * you cannot open in a text editor to repair by hand is not quite a safety
 * net. The cost is a file two to three times larger, paid once a week into a
 * share sheet.
 */
export function serializeExportFile(file: ExportFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** Rows in the file, for the confirmation the Settings screen shows. */
export function countExportedRows(file: ExportFile): number {
  return Object.values(file.tables).reduce((total, rows) => total + rows.length, 0);
}
