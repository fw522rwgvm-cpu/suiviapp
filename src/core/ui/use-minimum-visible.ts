import { useEffect, useRef, useState } from 'react';

/**
 * Keeps something on screen for a minimum time once it has appeared at all.
 *
 * A loading indicator that shows for eighty milliseconds is worse than none:
 * it registers as a flash, and a flash reads as a glitch rather than as work
 * being done. Local SQLite answers in exactly that range, so the day carousel
 * spent its indicator like a blink.
 *
 * THE PART THAT MATTERS IS WHAT IT DOES NOT DO. It never shows the indicator
 * for something that was ready on the first frame — the common case, since
 * React Query keeps the neighbouring days warm. A minimum is only imposed once
 * the waiting has actually begun; otherwise every cached day would be delayed
 * half a second in the name of looking smooth, which is the trade nobody wants.
 *
 * @param active whether the underlying thing is still pending
 * @param ms how long it stays visible once it has appeared
 */
export function useMinimumVisible(active: boolean, ms: number): boolean {
  const [visible, setVisible] = useState(active);
  // When the current spell of waiting began. Null between spells.
  const since = useRef<number | null>(active ? Date.now() : null);

  useEffect(() => {
    if (active) {
      since.current ??= Date.now();
      setVisible(true);
      return;
    }

    if (since.current === null) {
      setVisible(false);
      return;
    }

    // Only the REMAINDER is waited out. A load that already took longer than
    // the minimum hides at once, so this can never make a slow day slower.
    const remaining = Math.max(0, ms - (Date.now() - since.current));
    const timer = setTimeout(() => {
      since.current = null;
      setVisible(false);
    }, remaining);

    return () => clearTimeout(timer);
  }, [active, ms]);

  return visible;
}
