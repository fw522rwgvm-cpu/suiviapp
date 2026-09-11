/**
 * Sortable technical timestamps for file names.
 *
 * Deliberately not French and deliberately not a civil date. Everything else
 * in core/format renders figures for a human to read; this renders an instant
 * for a filesystem to sort. It lives here because it is formatting, and it is
 * written out rather than delegated so that sorting by name is sorting by age,
 * on every device, whatever the platform's locale data says.
 *
 * D3 forbids parsing 'YYYY-MM-DD' through the Date constructor. It says
 * nothing against turning an instant into a technical name, which is exactly
 * what instants are for. Note the direction: instant in, string out, and the
 * string never travels back into a date.
 *
 * Second user rule: this was the backup naming of D6/G1, and the export naming
 * of D7 is the second caller. Two copies of a padding loop would be two copies
 * free to drift, and a backup that no longer sorts next to an export is a
 * folder the user has to think about.
 */

function pad(value: number, width: number): string {
  return String(value).padStart(width, '0');
}

/** 'YYYYMMDD-HHMMSS'. Every field padded, so lexical order is chronological. */
export function formatInstantStamp(now: Date): string {
  return (
    `${pad(now.getFullYear(), 4)}${pad(now.getMonth() + 1, 2)}${pad(now.getDate(), 2)}` +
    `-${pad(now.getHours(), 2)}${pad(now.getMinutes(), 2)}${pad(now.getSeconds(), 2)}`
  );
}
