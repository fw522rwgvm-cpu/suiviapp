import { RIR_OPEN_ENDED, type SetTarget } from './session-set';

/**
 * The French a session is described in. Pure, so it is testable (D9).
 */

/**
 * The duration of a session, as the banner shows it (specs 10.3).
 *
 * ## HOURS ONLY WHEN THERE ARE HOURS
 *
 * "0:47:12" on a workout that has not reached an hour spends three characters
 * saying zero, on the one figure the banner exists to carry. A session that
 * passes an hour gains the field rather than reserving it.
 *
 * NO SECONDS, and that is the decision rather than the obvious omission. A
 * seconds digit changes every second, so it makes the banner MOVE — and this
 * banner is on every screen of the application (specs 10.3, "bandeau
 * persistant"), where something moving in the corner of the eye is a cost paid
 * on screens that have nothing to do with training. The rest timer is where
 * seconds matter, and it has its own countdown.
 */
export function durationText(ms: number): string {
  const totalMinutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes} min`;
  return `${hours} h ${String(minutes).padStart(2, '0')}`;
}

/** How far through the sets a session is (specs 10.3, "séries effectuées sur le total"). */
export function progressText(done: number, total: number): string {
  return `${done}/${total}`;
}

/**
 * The countdown of the rest timer, which is where seconds do matter.
 *
 * Always minutes and seconds, even under a minute: a bare "38" in a place a
 * duration belongs is a number the reader has to classify before reading.
 */
export function restText(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

/**
 * The placeholder a repetitions field carries (specs 10.3).
 *
 * > Les champs portent en texte indicatif les valeurs attendues de la routine ;
 * > pour une plage, la plage complète.
 *
 * "6-8" and not "6" — the specification is explicit, and the reason is the one
 * that also stops a range being auto-filled: a span prescribes no number, so
 * showing one end would be the application picking for the user.
 */
export function repsPlaceholder(target: SetTarget): string {
  const { repsMin, repsMax } = target;
  if (repsMin === null && repsMax === null) return '—';
  if (repsMin !== null && repsMax !== null && repsMin !== repsMax) return `${repsMin}-${repsMax}`;
  return String(repsMin ?? repsMax);
}

/** The placeholder a load field carries. A bodyweight movement has none. */
export function loadPlaceholder(target: SetTarget): string {
  return target.loadKg === null ? '—' : formatKg(target.loadKg);
}

/** The placeholder a duration field carries, for an exercise measured in time. */
export function durationPlaceholder(target: SetTarget): string {
  return target.durationSeconds === null ? '—' : `${target.durationSeconds}`;
}

/**
 * A load, written the way the rest of the application writes numbers.
 *
 * A comma for the decimal separator and no trailing zero: 72,5 and 70, never
 * 72.5 or 70,0. core/format owns this for macros; a load is the same question
 * with a different unit, and duplicating the rule here rather than importing it
 * would be a second spelling of one convention.
 */
function formatKg(kg: number): string {
  const rounded = Math.round(kg * 100) / 100;
  return Number.isInteger(rounded)
    ? String(rounded)
    : String(rounded).replace('.', ',');
}

/**
 * A RIR, as the row writes it.
 *
 * The top of the scale means "four or more" (specs 10.3 spells it "4+"), so it
 * is the one value whose label is not its number. Written here rather than in
 * the component because it is a fact about the scale, not about the layout.
 */
export function rirLabel(rir: number): string {
  if (rir >= RIR_OPEN_ENDED) return '4+';
  return Number.isInteger(rir) ? String(rir) : String(rir).replace('.', ',');
}

/**
 * What the resume prompt says (specs 10.3, "reprise proposée à la réouverture").
 *
 * ## IT ASKS NOTHING ABOUT THE TIME THAT PASSED
 *
 * > Aucune question supplémentaire n'est posée à la reprise.
 *
 * D12 is explicit, and the segments are why it can afford to be: the gap has
 * already been excluded from the duration by not being inside any segment, so
 * there is nothing to ask and nothing to correct. A session resumed three days
 * later needs no apology, which is the whole point of storing intervals.
 *
 * The date is named because a session from this morning and one from Tuesday
 * are different decisions, and that is the only fact the reader needs.
 */
export function resumeText(startedLabel: string, done: number, total: number): string {
  return `Séance du ${startedLabel}, ${progressText(done, total)} séries.`;
}
