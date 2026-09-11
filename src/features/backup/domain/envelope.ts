/**
 * The header: written on export, and the first barrier on import (D7).
 *
 * > Three validation barriers, all before the switch: incompatible format
 * > version refused; complete structural validation of the payload;
 * > referential integrity check.
 *
 * This module is the first of the three. It never looks at a single row: it
 * decides whether the file is one of ours at all, and under which schema its
 * rows were written. Everything downstream depends on that answer, which is
 * why it is a separate pass rather than the first lines of a bigger one.
 */

import {
  EXPORT_FORMAT_MARKER,
  EXPORT_FORMAT_VERSION,
  isSupportedFormatVersion,
} from './format-version';
import type { ExportEnvelope } from './envelope-types';
import { accept, refuse, type ImportProblem, type Verdict } from './problems';

export interface EnvelopeInput {
  /** Migration tag of the binary writing the file, e.g. '0001_journal'. */
  schemaVersion: string;
  schemaMigrationCount: number;
  appVersion: string;
  appVariant: string;
  /** Epoch milliseconds. Supplied rather than read, so this stays pure. */
  exportedAt: number;
}

/**
 * Builds the header.
 *
 * Key order is deliberate and load-bearing: JSON.stringify preserves insertion
 * order, and D7 wants a file someone can open in a text editor while already
 * in a bad situation. What identifies the file comes first, what dates it
 * comes last, and the rows come after all of it.
 */
export function buildEnvelope(input: EnvelopeInput): ExportEnvelope {
  return {
    format: EXPORT_FORMAT_MARKER,
    formatVersion: EXPORT_FORMAT_VERSION,
    schemaVersion: input.schemaVersion,
    schemaMigrationCount: input.schemaMigrationCount,
    appVersion: input.appVersion,
    appVariant: input.appVariant,
    exportedAt: input.exportedAt,
  };
}

/** Every migration tag the binary carries, in journal order. */
export interface BinarySchema {
  tags: readonly string[];
}

export interface AcceptedEnvelope {
  envelope: ExportEnvelope;
  /**
   * Position of schemaVersion in the binary's journal.
   *
   * This is the whole reason the barrier returns something instead of a
   * boolean: it is exactly the prefix of migrations the receiving database has
   * to be built at before the rows go in, and the suffix it then has to be
   * migrated through. An archive from the current binary lands on the last
   * index and the suffix is empty.
   */
  schemaIndex: number;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readString(
  source: Record<string, unknown>,
  field: string,
  problems: ImportProblem[],
): string | null {
  const value = source[field];
  if (typeof value !== 'string' || value === '') {
    problems.push({ code: 'header_field_invalid', field, found: value });
    return null;
  }
  return value;
}

function readInteger(
  source: Record<string, unknown>,
  field: string,
  problems: ImportProblem[],
): number | null {
  const value = source[field];
  if (typeof value !== 'number' || !Number.isInteger(value)) {
    problems.push({ code: 'header_field_invalid', field, found: value });
    return null;
  }
  return value;
}

/**
 * Barrier 1. Reads the header of an unknown value and says whether this binary
 * may go on reading the file.
 *
 * Collects rather than throws, like every barrier here — except for the two
 * refusals that make the rest meaningless: something that is not an object,
 * and something that is not one of our files. Past those there is nothing
 * left to inspect, and a list of twenty complaints about an unrelated JSON
 * document would be noise.
 */
export function readEnvelope(
  value: unknown,
  binary: BinarySchema,
): Verdict<AcceptedEnvelope> {
  if (!isPlainObject(value)) {
    return refuse({ code: 'not_an_object' });
  }

  if (value['format'] !== EXPORT_FORMAT_MARKER) {
    return refuse({ code: 'not_a_suivi_export', found: value['format'] });
  }

  const formatVersion = value['formatVersion'];
  if (typeof formatVersion !== 'number' || !isSupportedFormatVersion(formatVersion)) {
    return refuse({
      code: 'format_version_unsupported',
      found: formatVersion,
      supported: EXPORT_FORMAT_VERSION,
    });
  }

  const problems: ImportProblem[] = [];
  const schemaVersion = readString(value, 'schemaVersion', problems);
  const schemaMigrationCount = readInteger(value, 'schemaMigrationCount', problems);
  const appVersion = readString(value, 'appVersion', problems);
  const appVariant = readString(value, 'appVariant', problems);
  const exportedAt = readInteger(value, 'exportedAt', problems);

  if (
    schemaVersion === null ||
    schemaMigrationCount === null ||
    appVersion === null ||
    appVariant === null ||
    exportedAt === null
  ) {
    return { ok: false, problems };
  }

  const schemaIndex = binary.tags.indexOf(schemaVersion);

  if (schemaIndex === -1) {
    // A tag this binary does not carry is either ahead of it or from
    // somewhere else entirely, and the tag alone cannot tell the two apart.
    // schemaMigrationCount can, which is the reason that otherwise redundant
    // field is in the header: more migrations than the binary knows means the
    // archive is ahead. The refusal then reads exactly like G3's, because it
    // is the same mistake — an old binary writing into new data — arriving
    // through the other door.
    problems.push(
      schemaMigrationCount > binary.tags.length
        ? {
            code: 'schema_too_recent',
            found: schemaVersion,
            binary: binary.tags.at(-1) ?? '',
          }
        : { code: 'schema_unknown', found: schemaVersion },
    );
    return { ok: false, problems };
  }

  if (problems.length > 0) {
    return { ok: false, problems };
  }

  return accept({
    envelope: {
      format: EXPORT_FORMAT_MARKER,
      formatVersion,
      schemaVersion,
      schemaMigrationCount,
      appVersion,
      appVariant,
      exportedAt,
    },
    schemaIndex,
  });
}
