/**
 * The shape of the export file (D7). Types only — no behaviour, no imports.
 *
 * Split out from envelope.ts so that problems.ts can name a value's type
 * without envelope.ts and problems.ts importing each other.
 *
 * > Flat format, one array per entity, modelled on the tables. Header carrying
 * > format version, schema version, application version and a timestamp.
 * > Uncompressed and indented. File name dated and sortable.
 */

/**
 * A value as it survives a JSON round trip.
 *
 * SQLite's storage classes are TEXT, INTEGER, REAL, NULL and BLOB. The schema
 * holds no BLOB and is not going to: media are files, not data, and D7 excludes
 * them explicitly. So three JSON types cover everything, and anything else in
 * a file is a refusal rather than a coercion.
 *
 * Booleans are absent on purpose. The schema stores them as INTEGER 0/1
 * (section 2), so they travel as 0 and 1. Writing them as true/false would be
 * the export inventing a type the database does not have, and the import
 * guessing it back.
 */
export type ExportValue = string | number | null;

/** One row, keyed by SQL column name. */
export type ExportRow = Record<string, ExportValue>;

/**
 * The header.
 *
 * Four versions, because they answer four different questions, and D7 asks for
 * all four:
 *  - formatVersion: can this binary read the envelope at all?
 *  - schemaVersion: which migration tag were these rows written under?
 *  - appVersion / appVariant: who wrote it, for a human reading the file.
 *
 * schemaMigrationCount is redundant with schemaVersion and kept anyway: it is
 * the one field that stays meaningful if a tag is ever renamed, and it costs
 * one line in a file D7 wants readable by hand.
 */
export interface ExportEnvelope {
  format: string;
  formatVersion: number;
  schemaVersion: string;
  schemaMigrationCount: number;
  appVersion: string;
  /** 'production' or 'dev' (D1). Says which container an archive came from. */
  appVariant: string;
  /** Epoch milliseconds. An instant, never a civil date (D3). */
  exportedAt: number;
}

/** The whole file: header, then one array of rows per table. */
export interface ExportFile extends ExportEnvelope {
  tables: Record<string, ExportRow[]>;
}
