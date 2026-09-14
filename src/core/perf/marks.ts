/**
 * Instrumentation of the four critical transitions (D16).
 *
 * > Instrumentation en développement des quatre transitions du parcours
 * > critique. Sans mesure, une cible de performance n'est qu'un vœu.
 *
 * It had not been written for seven slices, and the target it protects has
 * been a wish that whole time. Slice 7 ends V1, so "later" would have meant V2.
 *
 * ## IT MEASURES WHEN THE USER SEES IT, NOT WHEN REACT IS DONE
 *
 * A transition ends when the destination is ON SCREEN, which is why `done` is
 * called from a passive effect rather than a layout effect: a layout effect
 * runs before paint, so it would report a figure the user has not yet had the
 * benefit of. The same distinction this project already met twice — the
 * carousel's key and the quantity wheels — read from the other side.
 *
 * ## NOTHING AT ALL IN A PRODUCTION BUILD
 *
 * Guarded by __DEV__ at every entry point, so the daily installation carries a
 * few dead function calls and no timers, no array, no state. Measuring the
 * critical path must not be a thing the critical path pays for.
 *
 * ## Date.now, NOT performance.now
 *
 * The budgets D16 sets are in tenths of a second; millisecond resolution is
 * ample, and Date.now is one thing fewer to be surprised by on Hermes. A clock
 * that moves backwards during a transition would give a negative figure, which
 * reads as obviously broken rather than as a fast run — the right failure.
 */

/** The four steps of the 15-second target, named as D16 tabulates them. */
export const TRANSITIONS = {
  /** Cold start to a legible remaining figure. Budget 1.5 s. */
  coldStart: 'Démarrage → restant lisible',
  /** Opening the add window. Budget 0.3 s. */
  openAdd: 'Ouverture de la fenêtre d’ajout',
  /** Choosing a food to the quantity step. Budget 0.2 s. */
  pickFood: 'Aliment choisi → quantité',
  /** Confirming to an up-to-date Journal. Budget 0.3 s. */
  confirm: 'Validation → Journal à jour',
} as const;

export type TransitionName = (typeof TRANSITIONS)[keyof typeof TRANSITIONS];

export interface Measurement {
  name: TransitionName;
  /** Milliseconds from start to on-screen. */
  ms: number;
  at: number;
}

/**
 * Whether this is a development build.
 *
 * Written with `typeof` rather than reading __DEV__ directly, because the
 * global exists in Metro and NOT in Node: a test that ever reaches this module
 * — none does today — would throw a ReferenceError at import time rather than
 * simply measuring nothing. Metro replaces __DEV__ with a literal at build
 * time, so the guard costs nothing there either.
 */
function isDev(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__;
}

const started = new Map<TransitionName, number>();

/**
 * The last measurement of each transition, and only the last.
 *
 * A history would be a better statistic and a worse tool: what anyone reads
 * this for is "is the thing I just did slow", and a list of forty would have
 * to be scrolled to find out. The slowest one seen is kept beside it, which is
 * the figure that actually matters — a budget is about the bad case.
 */
const latest = new Map<TransitionName, Measurement>();
const worst = new Map<TransitionName, Measurement>();

/**
 * Cold start is SEEDED AT MODULE LOAD, so it needs no special case.
 *
 * Putting it in the same map as the other three is what makes it fire exactly
 * once: `done` consumes a start. A constant read every time would have been
 * re-measured from the bundle's own birth on every later trip through the
 * Journal — an enormous, confident, meaningless figure.
 *
 * The instant is as close to "cold start" as this side of the application can
 * see: the process launching, the native runtime coming up and Hermes loading
 * the bytecode all happen where no JavaScript is running to time them. So the
 * figure UNDER-estimates what the user experiences, and saying so is the whole
 * reason it is written down rather than taken for the truth.
 */
if (isDev()) {
  started.set(TRANSITIONS.coldStart, Date.now());
}

export function begin(name: TransitionName): void {
  if (!isDev()) return;
  started.set(name, Date.now());
}

/**
 * Records a transition as finished, if it was started and not yet finished.
 *
 * The start is CONSUMED, which is what makes a destination safe to instrument
 * from an effect: a destination re-renders — a query settles, a list grows —
 * and every one of those renders runs the effect again. Only the first finds a
 * start.
 *
 * Silently does nothing when there is no start: a destination can be reached
 * by a path nobody instrumented — the quantity screen opened from a journal
 * row rather than from the add list, say — and inventing a duration for it
 * would be worse than having none.
 */
export function done(name: TransitionName): void {
  if (!isDev()) return;

  const from = started.get(name);
  if (from === undefined) return;
  started.delete(name);

  const measurement: Measurement = { name, ms: Date.now() - from, at: Date.now() };
  latest.set(name, measurement);

  const previous = worst.get(name);
  if (previous === undefined || measurement.ms > previous.ms) {
    worst.set(name, measurement);
  }
}

export interface Reading {
  name: TransitionName;
  last: Measurement | null;
  worst: Measurement | null;
}

/** Every transition, in D16's order, measured or not. */
export function readMeasurements(): Reading[] {
  return Object.values(TRANSITIONS).map((name) => ({
    name,
    last: latest.get(name) ?? null,
    worst: worst.get(name) ?? null,
  }));
}

/** The budgets D16 tabulates, in milliseconds, for the section to read against. */
export const BUDGETS_MS: Record<TransitionName, number> = {
  [TRANSITIONS.coldStart]: 1500,
  [TRANSITIONS.openAdd]: 300,
  [TRANSITIONS.pickFood]: 200,
  [TRANSITIONS.confirm]: 300,
};
