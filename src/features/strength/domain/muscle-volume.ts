import type { Muscle } from '@/core/db/schema';

/**
 * How much of a routine each muscle carries (specs 10.2, the body map).
 *
 * ## A SECONDARY SET COUNTS HALF, AND THAT IS AN ARBITRATION
 *
 * The obvious rule — one set counts one for every muscle it names — makes the
 * map lie about what a routine IS. On a push routine, the triceps appear in the
 * bench press, the overhead press and their own isolation work: counted whole
 * they reach eight sets against the chest's three, and the drawing says it is a
 * triceps session.
 *
 * Counting only the primary muscle fails the other way: the forearms are almost
 * never anybody's primary, so they would never light at all. That is the FALSE
 * NEGATIVE this whole feature exists to avoid — a muscle worked but shown grey
 * reads as "I never train that".
 *
 * So: primary 1, secondary 0.5. It is a convention rather than a measurement,
 * and it is the one the training literature uses for direct and indirect
 * volume. Flagged as chosen.
 *
 * ## THE HALVES NEVER REACH THE SCREEN
 *
 * "4,5 séries" is not a thing anybody did. The weighted total decides the
 * COLOUR; the tooltip states whole numbers — "5 séries dont 2 directes" — so
 * the figure a reader sees is always one they could have counted themselves.
 */

/** What a set contributes to a muscle it names. */
export const PRIMARY_WEIGHT = 1;
export const SECONDARY_WEIGHT = 0.5;

export interface MuscleVolume {
  /** Sets whose PRIMARY muscle is this one. A whole number. */
  direct: number;
  /** Sets naming it as a secondary. A whole number. */
  indirect: number;
  /** direct + 0.5 × indirect, which is what the colour reads. */
  weighted: number;
}

/** One set of one exercise, as this module needs it. */
export interface VolumeSet {
  primaryMuscle: string;
  secondaryMuscles: readonly string[];
}

export function tallyMuscles(sets: Iterable<VolumeSet>): Map<string, MuscleVolume> {
  const tally = new Map<string, MuscleVolume>();

  const bump = (muscle: string, direct: boolean): void => {
    const current = tally.get(muscle) ?? { direct: 0, indirect: 0, weighted: 0 };
    if (direct) current.direct += 1;
    else current.indirect += 1;
    current.weighted = current.direct * PRIMARY_WEIGHT + current.indirect * SECONDARY_WEIGHT;
    tally.set(muscle, current);
  };

  for (const set of sets) {
    bump(set.primaryMuscle, true);
    // A muscle listed as secondary on an exercise whose primary it also is
    // would be counted twice. The editor refuses that draft, but an imported
    // row can hold it, so it is skipped here rather than trusted.
    for (const muscle of set.secondaryMuscles) {
      if (muscle !== set.primaryMuscle) bump(muscle, false);
    }
  }

  return tally;
}

/**
 * How hard a muscle is worked, in four steps.
 *
 * ## THE THRESHOLDS ARE CHOSEN, NOT MEASURED — FLAGGED
 *
 * They are read against ONE routine, not a week: the usual 10-20 weekly sets
 * would put every routine in the lowest band and the map would never change
 * colour. Three, six and ten weighted sets is what a session actually looks
 * like — a couple of sets is accessory work, half a dozen is the point of the
 * session, ten is a specialisation.
 *
 * Four steps rather than a continuous gradient, because a continuous scale is
 * unreadable: the eye cannot rank two reds a few percent apart, so it would
 * read as noise and invite a precision nothing here has.
 *
 * One line to change, and the day a routine's colours look wrong this is where
 * to look.
 */
export type VolumeLevel = 0 | 1 | 2 | 3;

export const VOLUME_THRESHOLDS = { light: 3, solid: 6, heavy: 10 } as const;

export function levelOf(weighted: number): VolumeLevel {
  if (weighted <= 0) return 0;
  if (weighted < VOLUME_THRESHOLDS.light) return 1;
  if (weighted < VOLUME_THRESHOLDS.solid) return 2;
  return 3;
}

/**
 * The tally a muscle carries, or nothing.
 *
 * Takes a string because it is read off columns with no CHECK: an unknown
 * muscle simply has no volume, which is the same answer the labels and the body
 * map already give.
 */
export function volumeOf(
  tally: ReadonlyMap<string, MuscleVolume>,
  muscle: string,
): MuscleVolume | null {
  return tally.get(muscle) ?? null;
}

/** Whole numbers, in French, for the tooltip. Never a half. */
export function volumeText(volume: MuscleVolume): string {
  const total = volume.direct + volume.indirect;
  const sets = total === 1 ? '1 série' : `${total} séries`;

  if (volume.indirect === 0) return sets;
  if (volume.direct === 0) {
    return volume.indirect === 1 ? '1 série indirecte' : `${sets} indirectes`;
  }
  return `${sets} dont ${volume.direct} directe${volume.direct > 1 ? 's' : ''}`;
}

/** Every muscle a tally names, heaviest first — for a legend or a test. */
export function rankedMuscles(tally: ReadonlyMap<string, MuscleVolume>): string[] {
  return [...tally.entries()]
    .sort((a, b) => b[1].weighted - a[1].weighted || a[0].localeCompare(b[0]))
    .map(([muscle]) => muscle);
}

/** Narrowing helper for callers that hold typed muscles. */
export function isTallied(
  tally: ReadonlyMap<string, MuscleVolume>,
  muscle: Muscle,
): boolean {
  return tally.has(muscle);
}
