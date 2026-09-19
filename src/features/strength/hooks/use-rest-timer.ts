import { useEffect, useRef, useState } from 'react';
import { Vibration } from 'react-native';
import type { SessionId } from '@/core/db/schema';
import { restWindow, type RestingSet } from '../domain/rest-timer';

/**
 * The rest timer (specs 10.3, 14.40, D12).
 *
 * > Le minuteur de repos démarre automatiquement à la validation d'une série.
 *
 * ## THE COUNTDOWN CANNOT FAIL, AND IT NEEDS NOTHING
 *
 * It is derived from the session — session_set.completed_at plus the block's
 * rest — so it needs no permission, no native module and no state. It is right
 * after a force quit for free, because the instant it reads was written in the
 * same transaction as the set.
 *
 * ## IT VIBRATES; IT NO LONGER NOTIFIES — AND THE LIMIT IS REAL
 *
 * Requested (specs 14.40). Slice 11 scheduled a local notification, which is
 * what made a rest ring with the phone in a pocket. **A vibration driven from
 * JavaScript only fires while the application is in the FOREGROUND**: lock the
 * screen or switch app and this timer does not run at all, so nothing happens.
 * That is the price of dropping the notification, it is stated rather than
 * discovered, and it is reversible — the scheduling was six lines.
 *
 * NO SOUND, and that is not an omission: playing one needs an audio module,
 * which is outside section 5 and would cost a CI cycle and an explicit
 * approval. `Vibration` is React Native's own, so nothing enters. On iOS it
 * ignores a pattern and plays the system vibration once, which is the whole of
 * what is wanted.
 *
 * ## IT FIRES ONCE PER REST, KEYED ON THE DEADLINE
 *
 * `alerted` holds the `endsAt` it has already announced. Validating the next
 * set early moves the deadline, which is a new rest and a new announcement;
 * re-rendering for any other reason is not.
 */
export function useRestTimer(
  sessionId: SessionId | null,
  blocks: readonly { restSeconds: number | null; sets: readonly RestingSet[] }[],
  alertEnabled: boolean,
): { endsAt: number | null; remainingMs: number } {
  const [now, setNow] = useState(() => Date.now());
  const window = sessionId === null ? null : restWindow(blocks, now);
  const endsAt = window?.endsAt ?? null;

  /** The deadline already announced, so one rest vibrates once. */
  const alerted = useRef<number | null>(null);

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

    const tick = (): void => {
      const instant = Date.now();
      setNow(instant);
      if (instant < endsAt || alerted.current === endsAt) return;
      alerted.current = endsAt;
      // Read from the closure rather than a ref: the effect re-runs when the
      // setting changes, so this is always the current answer.
      if (alertEnabled) Vibration.vibrate();
    };

    const timer = setInterval(tick, 1000);
    return () => clearInterval(timer);
  }, [endsAt, alertEnabled]);

  return { endsAt, remainingMs: endsAt === null ? 0 : Math.max(0, endsAt - now) };
}
