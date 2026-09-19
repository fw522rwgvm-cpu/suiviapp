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

/*
 * WHAT USED TO BE HERE, AND WHY IT IS NOT.
 *
 * `restNotificationId` and `REST_NOTIFICATION` minted a local notification so a
 * rest could ring with the phone in a pocket. Requested removed (specs 14.40):
 * the end of a rest vibrates instead, and nothing is scheduled at all.
 *
 * They are DELETED rather than left in place, on the rule this project has
 * followed since readFirstWeightDate — code with no caller is a trap for
 * whoever rewires it believing it is used.
 *
 * Slice 9 and slice 11 both wrote at length about the invariant they carried:
 * adding `rest_timer` to NOTIFICATION_KINDS would hand the timer to a planner
 * that has never heard of it, which would cancel it mid-workout. That invariant
 * has no subject any more — there is no rest notification to cancel — but the
 * planner's own rule is still worth a test, and tests/notifications/apply.test
 * keeps it with an identifier that is plainly not its own.
 *
 * If a rest notification ever comes back — the honest reason would be covering
 * the locked screen, which a vibration cannot — it must NOT become a
 * NOTIFICATION_KIND.
 */
