import { useEffect, useRef, useState } from 'react';
import type { SessionId } from '@/core/db/schema';
import { getNotificationHost } from '@/features/notifications/host-registry';
import {
  REST_NOTIFICATION,
  restNotificationId,
  restWindow,
  type RestingSet,
} from '../domain/rest-timer';

/**
 * The rest timer (specs 10.3, 9.3, D12).
 *
 * > Le minuteur de repos démarre automatiquement à la validation d'une série.
 *
 * ## TWO HALVES, AND ONLY ONE OF THEM CAN FAIL
 *
 * The COUNTDOWN is derived from the session — session_set.completed_at plus the
 * block's rest — so it needs no permission, no native module and no state. It
 * is right after a force quit for free, because the instant it reads was
 * written in the same transaction as the set.
 *
 * The NOTIFICATION is what makes it ring with the phone in a pocket, and it is
 * best effort: iOS may refuse permission, and specs 9.3 already records the
 * limit that a silent phone makes no sound. So the screen never depends on it.
 *
 * ## ONE NOTIFICATION PER SESSION, WHICH IS HOW THE CANCELLATION HAPPENS
 *
 * Specs 9.3: "programmée à la validation d'une série et annulée à la validation
 * de la suivante". Keying the identifier on the SESSION rather than on the set
 * makes that automatic — scheduling the next one replaces the previous by
 * identity, and nobody has to remember to cancel. The same device applyPlan
 * uses for the daily kinds, for the same reason.
 *
 * ## AND PERMISSION IS ASKED AT THE FIRST ARM, NOT AT LAUNCH
 *
 * Specs 9.3 forbids asking at first launch — "un refus au démarrage est
 * définitif" — and requires the four daily kinds to ask on activation in the
 * Settings. The rest timer has no switch to activate, so the nearest honest
 * moment is the first time a rest actually starts: an explicit act, performed
 * by somebody who has just validated a set and is now waiting.
 *
 * Asked ONCE per launch at most, and never again if refused: the request is
 * behind a ref, so a workout of twenty sets asks zero further times.
 */
export function useRestTimer(
  sessionId: SessionId | null,
  blocks: readonly { restSeconds: number | null; sets: readonly RestingSet[] }[],
): { endsAt: number | null; remainingMs: number } {
  const [now, setNow] = useState(() => Date.now());
  const window = sessionId === null ? null : restWindow(blocks, now);
  const endsAt = window?.endsAt ?? null;

  /** What was last handed to iOS, so an unchanged window asks for nothing. */
  const armed = useRef<number | null>(null);
  const asked = useRef(false);

  useEffect(() => {
    if (sessionId === null) return;
    const id = restNotificationId(sessionId);
    const host = getNotificationHost();

    if (endsAt === null) {
      // Nothing resting: take back whatever was pending. A rest cut short by
      // validating the next set early must not ring after it.
      if (armed.current !== null) {
        armed.current = null;
        void host.cancel(id);
      }
      return;
    }

    if (armed.current === endsAt) return;
    armed.current = endsAt;

    void (async () => {
      if (!asked.current) {
        asked.current = true;
        const permission = await host.getPermission();
        if (permission === 'undetermined') await host.requestPermission();
      }
      const seconds = (endsAt - Date.now()) / 1000;
      // The window may have closed while the prompt was up. Nothing to ring.
      if (seconds <= 0) return;
      await host.scheduleAfter({
        id,
        title: REST_NOTIFICATION.title,
        body: REST_NOTIFICATION.body,
        seconds,
      });
    })();
  }, [sessionId, endsAt]);

  /**
   * The countdown ticks every second, and ONLY while one is running.
   *
   * The band's duration ticks every fifteen because it shows minutes; this
   * shows seconds, so it has to. What keeps that cheap is the guard: with no
   * rest in progress there is no interval at all, which is most of a workout
   * and all of the rest of the application.
   */
  useEffect(() => {
    if (endsAt === null) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [endsAt]);

  return { endsAt, remainingMs: endsAt === null ? 0 : Math.max(0, endsAt - now) };
}
