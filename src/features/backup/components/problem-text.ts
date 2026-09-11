import type { ImportProblem } from '../domain/problems';

/**
 * French for the refusals of D7.
 *
 * The domain speaks in codes; only this file speaks French. Conventions
 * section 4: code and comments in English, French reserved for displayed
 * strings, colocated in their domain. The validator would otherwise have the
 * interface's language sitting in the middle of it.
 *
 * Every message names a place — a table, a row, a column — because D7 refuses
 * compression precisely so the file can be opened and repaired, and a refusal
 * that does not say where is a refusal the user cannot act on.
 *
 * No internationalisation library (D10). The interface is French only.
 */

const TABLES: Record<string, string> = {
  setting: 'réglages',
  day: 'journées',
  day_meal: 'repas',
  journal_entry: 'entrées du journal',
};

function tableLabel(name: string): string {
  return TABLES[name] ?? name;
}

/** "ligne 4 de « entrées du journal »" */
function at(table: string, index: number): string {
  return `ligne ${index + 1} de « ${tableLabel(table)} »`;
}

export function describeProblem(problem: ImportProblem): string {
  switch (problem.code) {
    case 'not_an_object':
      return "Ce fichier ne contient pas d'objet JSON.";
    case 'not_a_suivi_export':
      return "Ce fichier n'est pas un export de Suivi.";
    case 'format_version_unsupported':
      return `Format d’export inconnu (version ${String(problem.found)}). Cette version de l’application lit le format ${problem.supported}.`;
    case 'header_field_invalid':
      return `En-tête incomplet : le champ « ${problem.field} » est absent ou invalide.`;
    case 'schema_unknown':
      return `Cette archive annonce une version de base de données inconnue (${problem.found}).`;
    case 'schema_too_recent':
      return `Cette archive a été écrite par une version plus récente de l’application (${problem.found}, contre ${problem.binary} ici). Installez la dernière version avant de l’importer.`;

    case 'tables_not_an_object':
      return 'La section « tables » du fichier est illisible.';
    case 'table_missing':
      return `La table « ${tableLabel(problem.table)} » manque dans l’archive.`;
    case 'table_unknown':
      return `L’archive contient une table inconnue : « ${problem.table} ».`;
    case 'table_not_an_array':
      return `La table « ${tableLabel(problem.table)} » n’est pas une liste.`;
    case 'row_not_an_object':
      return `La ${at(problem.table, problem.index)} n’est pas un objet.`;

    case 'column_unknown':
      return `Colonne inconnue « ${problem.column} », ${at(problem.table, problem.index)}.`;
    case 'column_missing':
      return `Colonne obligatoire « ${problem.column} » absente, ${at(problem.table, problem.index)}.`;
    case 'column_null':
      return `La colonne « ${problem.column} » ne peut pas être vide, ${at(problem.table, problem.index)}.`;
    case 'column_type':
      return `La colonne « ${problem.column} » attend une valeur de type ${problem.expected}, ${at(problem.table, problem.index)}.`;

    case 'value_malformed':
      return `Valeur invalide dans « ${problem.column} » (${describeExpectation(problem.expected)}), ${at(problem.table, problem.index)}.`;
    case 'value_not_in_set':
      return `Valeur « ${String(problem.found)} » non autorisée dans « ${problem.column} » (attendu : ${problem.allowed.join(', ')}), ${at(problem.table, problem.index)}.`;
    case 'primary_key_duplicated':
      return `Identifiant en double (${problem.key}), ${at(problem.table, problem.index)}.`;

    case 'foreign_key_violated':
      return `${problem.count} ligne${problem.count > 1 ? 's' : ''} de « ${tableLabel(problem.table)} » renvoie${problem.count > 1 ? 'nt' : ''} vers une ligne qui n’existe pas.`;
    case 'denormalised_date_mismatch':
      return `${problem.count} entrée${problem.count > 1 ? 's' : ''} du journal porte${problem.count > 1 ? 'nt' : ''} une date différente de celle de son repas.`;
  }
}

function describeExpectation(expected: string): string {
  switch (expected) {
    case 'civil date':
      return 'date au format AAAA-MM-JJ';
    case 'entity id':
      return 'identifiant ULID';
    case 'integer':
      return 'nombre entier';
    default:
      return 'nombre fini';
  }
}

/**
 * The first few refusals, and how many were left out.
 *
 * All of them are collected — repairing a file one error per attempt is a path
 * you walk once, badly — but a screen that lists two hundred is a screen
 * nobody reads. The full list belongs in a text editor, next to the file.
 */
export function summariseProblems(
  problems: readonly ImportProblem[],
  limit = 5,
): { lines: string[]; hidden: number } {
  return {
    lines: problems.slice(0, limit).map(describeProblem),
    hidden: Math.max(0, problems.length - limit),
  };
}
