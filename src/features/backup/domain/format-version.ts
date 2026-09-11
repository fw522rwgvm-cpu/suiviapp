/**
 * Export format version, and its correspondence with the schema version (D7).
 *
 * > The export format version is distinct from the internal schema version:
 * > renaming a column must not invalidate the archives. An explicit
 * > correspondence table links the two.
 *
 * THE DECISION THIS FILE CARRIES, AND IT IS IRREVERSIBLE.
 *
 * The format version versions THE ENVELOPE, never the content. Version 1
 * means: one header object, plus a dictionary of "table name -> array of
 * rows", whose keys are SQL column names and whose values are JSON scalars.
 *
 * Adding a table does not move it. Adding a column does not move it. It moves
 * only if the shape itself changes — compression, NDJSON, ingredients nested
 * under their recipe.
 *
 * Why it has to be that way: the schema gains tables at slices 3, 5, 6, 8, 10,
 * 11 and 13. A format version that followed them would reach 8 by the end of
 * V3 without meaning anything, and every increment is an opportunity to orphan
 * an archive. The export is the only safety net this project has; an archive
 * written today has to open in three years.
 *
 * The content is covered instead by the schema version — the migration tag —
 * which already has a total order, and whose correspondence table already
 * exists and is already generated: meta/_journal.json. So the table below
 * stays short by construction, which is the point.
 */

/** Identifies the file at a glance, and rejects any other JSON immediately. */
export const EXPORT_FORMAT_MARKER = 'suivi-export';

/** What this binary writes, and the highest it can read. */
export const EXPORT_FORMAT_VERSION = 1;

export interface FormatGeneration {
  formatVersion: number;
  /** Schema tag this envelope shape was first written against. Informative. */
  introducedWith: string;
  /** What the envelope looks like. Prose, because that is what it versions. */
  envelope: string;
}

/**
 * The explicit correspondence D7 asks for.
 *
 * It reads "format version -> envelope shape", and NOT "format version ->
 * schema version", because the second is precisely the coupling D7 forbids.
 * `introducedWith` records where a generation started; it never bounds what it
 * can carry. A format 1 file is readable whatever schema tag it declares, so
 * long as that tag is one this binary knows.
 */
export const FORMAT_GENERATIONS: readonly FormatGeneration[] = [
  {
    formatVersion: 1,
    introducedWith: '0001_journal',
    envelope:
      'header object plus tables{}, one array of rows per table, ' +
      'keys are SQL column names, values are JSON scalars',
  },
];

export function isSupportedFormatVersion(formatVersion: number): boolean {
  return FORMAT_GENERATIONS.some(
    (generation) => generation.formatVersion === formatVersion,
  );
}
