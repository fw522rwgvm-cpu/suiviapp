import { formatKcal, formatMacroWhole } from '@/core/format';
import { remainingMacros, type Macros } from '@/features/nutrition/domain/macros';
import type { NotificationKind } from './kinds';

/**
 * What each notification says (specs 9.3).
 *
 * Pure, and French — these are displayed strings. Kept out of the scheduler so
 * that the one thing the summary DOES have to be right about, its figures, is
 * testable without iOS.
 *
 * ## THE SUMMARY TEXT IS ALSO THE CHANGE DETECTOR
 *
 * D14 asks the summary to be rescheduled on every write concerning the current
 * day, and NOT on a write to a past date. The change bus cannot tell them
 * apart: it invalidates by table predicate, and says nothing about which date
 * moved (D8). Writing a by-hand invalidation to fix that is forbidden outright.
 *
 * So the discrimination is not done on the write at all. The summary body is
 * composed from the day's figures; a write to a past date invalidates, the
 * query refetches, the figures come back IDENTICAL, and this function returns
 * the same string — so nothing is rescheduled. "A write to a past date does not
 * reschedule" is obtained without anyone filtering by date, because the data
 * did not move. The cost is a refetch for nothing, which is the cost the bus
 * already accepts in writing.
 *
 * Which is why the comparison must be on the TEXT and not on the query object:
 * React Query hands back a new object on every refetch.
 */

export interface NotificationContent {
  title: string;
  body: string;
}

/**
 * The day's figures, or the consumed figures alone.
 *
 * ## SPECS 9.3 ASKS FOR "CONSOMMÉ ET RESTANT", AND ONE OF THE TWO CAN BE ABSENT
 *
 * A day with no template has no targets at all — dayTargets returns null, and
 * readDailyTargets already refuses a partial set because a target nobody can
 * read is worse than none. So there is nothing to subtract from, and the
 * honest answer is the consumed figures on their own rather than a "restant"
 * computed against zero, which would report the whole day as an overshoot.
 *
 * This is a gap in specs 9.3 rather than a decision it took: it describes the
 * summary as though a target always exists, the way specs 8.2 assumed a
 * template always exists before slice 5 filled that in.
 */
export function summaryContent(consumed: Macros, targets: Macros | null): NotificationContent {
  const eaten = `${formatKcal(consumed.kcal)} kcal · ${formatMacroWhole(consumed.protein)} g de protéines`;

  if (targets === null) {
    return { title: 'Bilan de la journée', body: `Consommé : ${eaten}.` };
  }

  const left = remainingMacros(targets, consumed);

  // Negative means the target is passed, and the screen says so rather than
  // clamping at zero (specs 8.3) — so the notification says so too. Clamping
  // here would make every overshoot read as "pile poil".
  const remaining =
    left.kcal < 0
      ? `${formatKcal(-left.kcal)} kcal au-dessus de l’objectif`
      : `${formatKcal(left.kcal)} kcal restantes`;

  return {
    title: 'Bilan de la journée',
    body: `Consommé : ${eaten}. Il reste ${formatMacroWhole(left.protein)} g de protéines, ${remaining}.`,
  };
}

/** The three notifications whose text carries no figure at all. */
export const STATIC_CONTENT: Record<Exclude<NotificationKind, 'daily_summary'>, NotificationContent> =
  {
    weigh_in: {
      title: 'Pesée du matin',
      body: 'Aucune pesée enregistrée pour aujourd’hui.',
    },
    empty_journal: {
      title: 'Journal vide',
      body: 'Rien n’a été ajouté au journal aujourd’hui.',
    },
    export_reminder: {
      // The one safety net there is (specs 5.4), so the text says what is at
      // stake rather than only what to do. The weight in particular exists
      // nowhere else — specs 9.1, "la double saisie est définitive".
      title: 'Sauvegarde à faire',
      body: 'Votre dernier export commence à dater. Vos données n’existent que sur ce téléphone.',
    },
  };

/**
 * Text of any occurrence, with the figures only where there are figures.
 *
 * `summary` is null for the three static kinds, and passing one for them is not
 * an error worth guarding: the type already says which kind carries figures.
 */
export function contentFor(
  kind: NotificationKind,
  summary: NotificationContent | null,
): NotificationContent {
  if (kind === 'daily_summary') {
    // A summary with no figures is not a summary. The caller composes it from
    // the day's totals; if it could not, the plan does not carry the occurrence
    // at all rather than firing something empty.
    return summary ?? { title: 'Bilan de la journée', body: 'Aucune donnée pour aujourd’hui.' };
  }
  return STATIC_CONTENT[kind];
}
