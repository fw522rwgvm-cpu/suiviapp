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
