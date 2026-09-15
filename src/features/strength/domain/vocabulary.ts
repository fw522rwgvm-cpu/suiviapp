import {
  EQUIPMENT,
  MUSCLES,
  SET_TYPES,
  type Equipment,
  type Muscle,
  type SetType,
} from '@/core/db/schema';

/**
 * What the three stored vocabularies are called on screen (specs 10.1, 10.2).
 *
 * The split is the project's convention applied to a domain that needed it for
 * the first time: the VALUES live in the schema module, in English, because
 * they are what goes in the column and what the export catalogue's one_of rule
 * names; the LABELS live here, in French, because French is reserved for
 * displayed strings.
 *
 * day_meal.name is the one place that does it the other way round, and the
 * reason is worth restating so this looks deliberate rather than inconsistent:
 * a meal name is FROZEN VERBATIM into a day, so storing it in French makes
 * freezing a copy rather than a translation. Nothing freezes a muscle — a
 * routine line stores `exercise_id`, and slice 11 will freeze an exercise NAME,
 * which the user typed.
 *
 * ## THE RECORDS ARE EXHAUSTIVE BY TYPE, NOT BY CARE
 *
 * Each is typed `Record<Muscle, string>`, so adding a value to MUSCLES without
 * labelling it fails the build at this file rather than displaying a raw
 * `lower_back` somewhere. That is the whole reason the type is derived from the
 * array instead of written beside it.
 */

export const MUSCLE_LABELS: Record<Muscle, string> = {
  chest: 'Pectoraux',
  shoulders: 'Épaules',
  biceps: 'Biceps',
  triceps: 'Triceps',
  forearms: 'Avant-bras',
  abs: 'Abdominaux',
  obliques: 'Obliques',
  lats: 'Dorsaux',
  traps: 'Trapèzes',
  lower_back: 'Lombaires',
  glutes: 'Fessiers',
  quads: 'Quadriceps',
  hamstrings: 'Ischio-jambiers',
  adductors: 'Adducteurs',
  calves: 'Mollets',
};

export const EQUIPMENT_LABELS: Record<Equipment, string> = {
  barbell: 'Barre',
  dumbbell: 'Haltères',
  machine: 'Machine',
  cable: 'Poulie',
  bodyweight: 'Poids du corps',
  kettlebell: 'Kettlebell',
  band: 'Élastique',
  other: 'Autre',
};

/**
 * Specs 6.3 gives these four in French — `échauffement | travail (défaut) |
 * drop set | série longue / échec` — and the last is a phrase rather than a
 * label. Shortened to "Série longue" for a row that also carries a rep range, a
 * load and a rest; the full sense is in the specs, not on a chip.
 */
export const SET_TYPE_LABELS: Record<SetType, string> = {
  warmup: 'Échauffement',
  work: 'Travail',
  dropset: 'Drop set',
  long: 'Série longue',
};

/** The muscles in display order, which is the declaration order of MUSCLES. */
export function muscleOptions(): readonly { value: Muscle; label: string }[] {
  return MUSCLES.map((value) => ({ value, label: MUSCLE_LABELS[value] }));
}

export function equipmentOptions(): readonly { value: Equipment; label: string }[] {
  return EQUIPMENT.map((value) => ({ value, label: EQUIPMENT_LABELS[value] }));
}

export function setTypeOptions(): readonly { value: SetType; label: string }[] {
  return SET_TYPES.map((value) => ({ value, label: SET_TYPE_LABELS[value] }));
}

/**
 * The label for a stored value, falling back to the value itself.
 *
 * AN UNKNOWN VALUE IS DISPLAYED AS IT STANDS, never blanked and never refused.
 * These columns carry no CHECK, so a hand-repaired archive can hold anything,
 * and the rule this project has applied since meal-kinds.ts is that rows it did
 * not write are shown rather than corrected — rewriting somebody's old data to
 * satisfy a rule that did not exist when it was made is what specs 5.2 forbids.
 */
/**
 * Looked up through a Map rather than by indexing the Record, because the
 * argument is a STRING off a column with no CHECK, and conventions section 4
 * refuses to type outside data by assertion. `MUSCLE_LABELS[value as Muscle]`
 * would compile and would be a lie about where the value came from.
 *
 * Object.entries widens the keys to string honestly, so nothing is asserted
 * anywhere on this path.
 */
const MUSCLE_LOOKUP = new Map<string, string>(Object.entries(MUSCLE_LABELS));
const EQUIPMENT_LOOKUP = new Map<string, string>(Object.entries(EQUIPMENT_LABELS));
const SET_TYPE_LOOKUP = new Map<string, string>(Object.entries(SET_TYPE_LABELS));

export function muscleLabel(value: string): string {
  return MUSCLE_LOOKUP.get(value) ?? value;
}

export function equipmentLabel(value: string | null): string | null {
  if (value === null) return null;
  return EQUIPMENT_LOOKUP.get(value) ?? value;
}

export function setTypeLabel(value: string): string {
  return SET_TYPE_LOOKUP.get(value) ?? value;
}

/** Whether a stored string is one of the values this build knows. */
export function isMuscle(value: string): value is Muscle {
  return MUSCLE_LOOKUP.has(value);
}

export function isEquipment(value: string): value is Equipment {
  return EQUIPMENT_LOOKUP.has(value);
}

export function isSetType(value: string): value is SetType {
  return SET_TYPE_LOOKUP.has(value);
}
