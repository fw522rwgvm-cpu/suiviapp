import { useEffect, useMemo, useRef } from 'react';
import { AppState } from 'react-native';
import type { SessionId, SessionSetId } from '@/core/db/schema';
import { flushTypedSet } from '../data/session-queries';
import {
  DEFERRED_WRITE_MS,
  createPendingWrites,
  type TypedFields,
} from '../domain/pending-writes';

/**
 * The deferred write rhythm of D12, wired to a timer and to AppState.
 *
 * > Toute écriture différée est vidée au passage en arrière-plan. C'est le
 * > moment précis où iOS peut tuer l'application sans préavis.
 *
 * The buffer itself is pure and tested (domain/pending-writes.ts); what lives
 * here is the part Node cannot run — a timer, and a subscription to something
 * only iOS raises.
 */
export function useDeferredSetWrites(sessionId: SessionId | null): {
  queue: (setId: SessionSetId, fields: TypedFields) => void;
  flush: () => void;
} {
  const pending = useMemo(() => createPendingWrites<SessionSetId>(), []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /**
   * The session id in a REF, not in the closure of the effect.
   *
   * The background flush has to write against whatever session is live at the
   * moment iOS suspends, and a callback captured when the subscription was
   * created holds the id from that render. Slice 9 hit the same shape in the
   * swipe guard: a worklet sees a prop as it was at construction, and a cart
   * filled afterwards has to arm it.
   */
  const sessionRef = useRef(sessionId);
  sessionRef.current = sessionId;

  const flush = useRef(() => {
    const live = sessionRef.current;
    const entries = pending.drain();
    if (live === null || entries.length === 0) return;
    for (const [setId, fields] of entries) {
      flushTypedSet({ setId, sessionId: live, typed: fields });
    }
  }).current;

  useEffect(() => {
    /**
     * 'background' AND 'inactive', because the second is the one that arrives
     * first and sometimes alone: the control centre, the notification shade, an
     * incoming call. Flushing there costs one SQLite write against nothing
     * pending most of the time, and not flushing costs the field being typed.
     */
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        if (timer.current !== null) {
          clearTimeout(timer.current);
          timer.current = null;
        }
        flush();
      }
    });

    return () => {
      subscription.remove();
      // Leaving the screen flushes too: the row that was being typed is gone
      // from the tree, so nothing will ever come back to write it.
      if (timer.current !== null) {
        clearTimeout(timer.current);
        timer.current = null;
      }
      flush();
    };
  }, [flush]);

  return {
    queue: (setId, fields) => {
      pending.put(setId, fields);
      if (timer.current !== null) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        timer.current = null;
        flush();
      }, DEFERRED_WRITE_MS);
    },
    flush,
  };
}
