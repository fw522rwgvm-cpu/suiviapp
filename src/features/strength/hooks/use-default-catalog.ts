import { useEffect, useRef } from 'react';
import { getAppDatabase } from '@/core/db/app-database';
import { readProgressionIncrement } from '../data/strength-settings';
import { installDefaultCatalogOnce } from '../data/catalog-writes';

/**
 * Installs the default exercises once per installation (specs 10.1).
 *
 * ## ONCE PER LAUNCH, AND THE DATABASE DECIDES IF IT RUNS
 *
 * The shape useSweepOffCacheOnce set: a ref so it cannot fire twice in a
 * session, an effect so it happens after the first paint, and the actual
 * decision inside the write — installDefaultCatalogOnce reads a `setting` row
 * and returns null if it has already been done. Nothing here knows whether it
 * should run, which is what stops this hook and that row disagreeing.
 *
 * ## AFTER THE FIRST PAINT, NOT IN THE STARTUP SEQUENCE
 *
 * The startup sequence of D6 is five steps and every one of them has to finish
 * before anything is drawn — refuse a newer database, clear a stale import,
 * back up, migrate. Inserting two hundred exercises there would put a write
 * nobody is waiting for in front of the 1.5 s D16 budgets for a cold start to a
 * readable figure.
 *
 * Here it runs while the Journal is already on screen, and the change bus makes
 * the library appear when it lands. Somebody who opens the Entraînement tab in
 * the first instant sees it fill, which is honest — it IS filling.
 *
 * ## FAILURE IS SWALLOWED, AS THE BACKUP ROTATION SWALLOWS ITS OWN
 *
 * A catalogue that could not be installed is a library somebody has to fill by
 * hand, which is the state every installation before this slice was in. It is
 * not a reason for the application to refuse to work.
 */
export function useDefaultCatalogOnce(): void {
  const done = useRef(false);

  useEffect(() => {
    if (done.current) return;
    done.current = true;

    try {
      const db = getAppDatabase();
      // The global increment is an INITIAL value copied onto each exercise
      // (specs 6.3), so it is read once here and handed down — the write has no
      // business reading a settings row, which would be a second path to the
      // same number.
      installDefaultCatalogOnce(db, readProgressionIncrement(db), Date.now());
    } catch {
      // See the note above.
    }
  }, []);
}
