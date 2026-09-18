/**
 * The rest timer (specs 9.3, 10.3, D12).
 *
 * > Le minuteur de repos démarre automatiquement à la validation d'une série.
 * > Il est réalisé par une notification locale unique, programmée à la
 * > validation d'une série et annulée à la validation de la suivante.
 *
 * ## NOTHING IS STORED, AND NOTHING NEEDED TO BE
 *
 * D12: "aucun compteur n'est stocké. On stocke l'instant de départ, la durée se
 * déduit. Seule forme qui survive à un arrêt forcé."
 *
 * The instant of departure ALREADY EXISTS: it is session_set.completed_at of
 * the set that was just validated, written in the same transaction as the set
 * itself. So this whole feature adds no column, no row and no state — it is a
 * function of the session, and it survives a force quit because the session
 * does. D9 would have refused a stored countdown anyway; here it costs nothing
 * to obey.
 */

import type { SessionId } from '@/core/db/schema';

/** One set, as this module needs to see it. */
export interface RestingSet {
  completedAt: number | null;
  status: string;
}

export interface RestWindow {
  /** When the rest started — the instant the set was validated. */
  startedAt: number;
  /** When it is up. */
  endsAt: number;
}

/**
 * The rest in progress, derived from the session.
 *
 * Takes the LAST set validated across the whole session and the rest its block
 * prescribes. Not "the current block", because a superset's rest belongs to the
 * block and the last validated set is the one that started resting — which is
 * the same thing whenever it matters and unambiguous when it does not.
 *
 * Returns null when nothing has been validated, when the block prescribes no
 * rest, or when the window has already closed. A caller therefore never has to
 * ask whether a countdown is running: it either has one or it does not.
 */
export function restWindow(
  blocks: readonly { restSeconds: number | null; sets: readonly RestingSet[] }[],
  now: number,
): RestWindow | null {
  let startedAt: number | null = null;
  let restSeconds: number | null = null;

  for (const block of blocks) {
    for (const set of block.sets) {
      if (set.status !== 'done' || set.completedAt === null) continue;
      if (startedAt === null || set.completedAt > startedAt) {
        startedAt = set.completedAt;
        restSeconds = block.restSeconds;
      }
    }
  }

  if (startedAt === null || restSeconds === null || restSeconds <= 0) return null;

  const endsAt = startedAt + restSeconds * 1000;
  // A window that closed is not a window. The caller shows nothing rather than
  // a negative countdown, and the notification for it has already fired.
  if (endsAt <= now) return null;
  return { startedAt, endsAt };
}

/**
 * The identifier of the rest notification.
 *
 * ## IT IS NOT A NOTIFICATION_KIND, AND THAT IS THE WHOLE POINT
 *
 * The obvious move was to add `rest_timer` to NOTIFICATION_KINDS — the schema
 * comment on notification_setting even invites it, and the export catalogue
 * says "slice 11 adds a kind here".
 *
 * It would have introduced exactly the defect slice 9 wrote a paragraph to
 * prevent. diffSchedule decides what the daily planner OWNS with
 * `NOTIFICATION_KINDS.some(kind => id.startsWith(kind + ':'))`, and everything
 * it owns that is not in the plan gets cancelled — on every foreground and
 * every invalidation the bus raises. Adding the kind would have handed the rest
 * timer to a scheduler that has never heard of it, which would have cancelled
 * it in the middle of a workout. Nothing would have reported it: the timer
 * simply would not have rung.
 *
 * So `rest:` is its own namespace, no kind is a prefix of it, and slice 9's
 * code does not change by one line. A test asserts the planner leaves it alone,
 * because the property is INVISIBLE — it holds by two constants not colliding,
 * and nothing about either one says so.
 *
 * ## AND THERE IS NO SETTING ROW EITHER
 *
 * The four kinds are switches with an hour. This has neither: specs 9.3
 * describes it as a consequence of validating a set, not as something turned
 * on, and specs 12 lists no setting for it. A row that stated nothing would be
 * a fifth line on a screen of four decisions.
 *
 * One per session rather than one per set: only one rest can be running, and
 * keying on the session means validating the next set REPLACES it by identity
 * — which is what specs 9.3 means by "annulée à la validation de la suivante",
 * obtained without anyone having to cancel anything.
 */
export function restNotificationId(sessionId: SessionId): string {
  return `rest:${sessionId}`;
}

/** What the notification says when the rest is up. */
export const REST_NOTIFICATION = {
  title: 'Repos terminé',
  body: 'Série suivante.',
} as const;
