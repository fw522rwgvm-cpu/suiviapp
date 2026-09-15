/**
 * How old the last export is (specs 5.4, "indicateur d'ancienneté").
 *
 * > Settings display, from V1 on, the date of the last export, highlighted
 * > beyond a delay. A fourth local notification takes over from V2 (9.3).
 *
 * Pure, and measured in DURATION rather than in civil days. That is a
 * deliberate reading of D3, not an oversight: "how long since" is an elapsed
 * time between two instants, which is exactly what instants are for, and it
 * raises no timezone question at all. A count of civil days would — an export
 * at 23:50 and a glance at 00:10 are one civil day apart and twenty minutes
 * apart, and the twenty minutes is the honest answer to "is my data safe".
 *
 * The stakes, spelled out by specs 5.4: this is the only backup mechanism, and
 * since v2.1 weight exists nowhere but locally. Losing the device without a
 * recent export is a flat loss. So this indicator is the one number in the
 * application that must never err in the reassuring direction.
 */

const MS_PER_DAY = 86_400_000;

export type ExportFreshness =
  /** Nothing has ever been exported. The most alarming state there is. */
  | { state: 'never' }
  | { state: 'fresh'; days: number; at: number }
  | { state: 'stale'; days: number; at: number };

/**
 * @param lastExportAt epoch ms of the last successful export, or null
 * @param now epoch ms, supplied rather than read, so this stays pure
 * @param reminderDays days beyond which the indicator is highlighted
 */
export function exportFreshness(
  lastExportAt: number | null,
  now: number,
  reminderDays: number,
): ExportFreshness {
  if (lastExportAt === null) return { state: 'never' };

  // A clock moved backwards — a timezone change, a manual correction — must
  // not read as an export in the future and therefore as fresh forever.
  const elapsed = Math.max(0, now - lastExportAt);
  const days = Math.floor(elapsed / MS_PER_DAY);

  return days >= reminderDays
    ? { state: 'stale', days, at: lastExportAt }
    : { state: 'fresh', days, at: lastExportAt };
}

/**
 * How long ago, in words (specs 5.4).
 *
 * Moved here from data-section.tsx when the Settings index gained a second
 * user: the row for Données says the age without being opened, and the page
 * behind it says it again in full. Two spellings of one figure would be free to
 * disagree, and the one the user checks at a glance is the one that would drift.
 *
 * Days rather than a duration, because that is what ExportFreshness carries —
 * and the indicator itself is measured in duration and floored to days there,
 * which is the deliberate reading of D3 recorded in slice 2.
 */
export function describeAge(days: number): string {
  if (days === 0) return 'aujourd’hui';
  if (days === 1) return 'hier';
  return `il y a ${days} jours`;
}

/** The same answer, short enough for a settings row. */
export function shortAge(freshness: ExportFreshness | undefined): string | undefined {
  if (freshness === undefined) return undefined;
  return freshness.state === 'never' ? 'Jamais' : describeAge(freshness.days);
}
