import type { LineDraft, RoutineProblem } from './routine-draft';

/**
 * How a routine reads in French. Pure, so it is testable (D9).
 */

/**
 * One set, in one line: "6-8 reps · 60 kg · RIR 2 · 2 min".
 *
 * ## EVERY PART IS OMITTED WHEN IT IS ABSENT, AND THAT IS THE WHOLE DESIGN
 *
 * A routine is built over time — an exercise is added with one empty set and
 * filled in as it is used. So a row must read correctly at every stage of that,
 * from "Série à définir" through to all four facts. Rendering "— kg" for a load
 * nobody set would put a placeholder where a fact goes, and a column of dashes
 * reads as missing data rather than as data not yet needed.
 *
 * The middle dot separates facts of DIFFERENT kinds, the way ExerciseRow
 * separates a muscle from equipment. A comma would read as a list of one thing.
 */
export function setSummary(line: LineDraft, restSeconds: number | null): string {
  const parts: string[] = [];

  const reps = repsText(line.repsMin, line.repsMax);
  if (reps !== null) parts.push(reps);

  if (line.targetLoadKg !== null) parts.push(`${formatNumber(line.targetLoadKg)} kg`);
  if (line.targetRir !== null) parts.push(`RIR ${formatNumber(line.targetRir)}`);
  if (restSeconds !== null) parts.push(restText(restSeconds));

  return parts.length === 0 ? 'Série à définir' : parts.join(' · ');
}

/**
 * "6-8 reps", "10 reps", "8+ reps", "jusqu'à 12 reps", or nothing.
 *
 * A HALF-OPEN RANGE IS NOT AN ERROR. ck_line_reps allows one bound alone, and
 * both readings are things people actually write down: "8 reps minimum" for a
 * set taken to a floor, "jusqu'à 12" for one capped. Collapsing either to a
 * fixed count would state a target nobody set.
 *
 * Equal bounds are a fixed count, which is what specs 6.3 means by
 * "répétitions, fixes ou en plage".
 */
export function repsText(min: number | null, max: number | null): string | null {
  if (min === null && max === null) return null;
  if (min !== null && max === null) return `${min}+ reps`;
  if (min === null && max !== null) return `jusqu’à ${max} reps`;
  if (min === max) return `${min} reps`;
  return `${min}-${max} reps`;
}

/**
 * A rest in the unit it is read in: seconds below a minute, minutes above.
 *
 * "90 s" and "1 min 30" are the same duration, and a gym timer is read in the
 * second form. Round minutes drop the seconds entirely — "2 min", never
 * "2 min 0".
 */
export function restText(seconds: number): string {
  if (seconds < 60) return `${seconds} s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest === 0 ? `${minutes} min` : `${minutes} min ${rest}`;
}

/** What a validation problem says to the person looking at the form. */
export function routineProblemText(problem: RoutineProblem): string {
  switch (problem.kind) {
    case 'name_missing':
      return 'Donnez un nom à la routine.';
    case 'no_blocks':
      return 'Ajoutez au moins un exercice.';
    case 'empty_block':
      return `Le bloc ${problem.blockIndex + 1} ne contient aucune série.`;
    case 'reps_inverted':
      return `Bloc ${problem.blockIndex + 1}, série ${problem.lineIndex + 1} : le minimum de répétitions dépasse le maximum.`;
  }
}

/** 2,5 rather than 2.5, and 60 rather than 60,0. */
function formatNumber(value: number): string {
  return String(value).replace('.', ',');
}

/**
 * The set type in the width of a table cell.
 *
 * "Série longue / échec" does not fit beside four numbers, and the full wording
 * is on the specification rather than on a row. `travail` has no short form on
 * purpose: it is the default, so the cell shows the set NUMBER instead, and the
 * exceptions are what stand out.
 */
export function setTypeShort(type: string): string {
  switch (type) {
    case 'warmup':
      return 'Éch';
    case 'dropset':
      return 'Drop';
    case 'long':
      return 'Long';
    default:
      return 'S';
  }
}
