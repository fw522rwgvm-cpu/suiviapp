import { LibraryScreen } from '@/features/nutrition/screens/library-screen';

/**
 * Route wiring only (D10).
 *
 * Section 3 of the architecture draws this at app/library/, at the root. It
 * lives inside the Journal's own stack instead, and that is a deliberate
 * divergence with a reason: pushed from the root it would be a sibling of
 * (tabs), so it would COVER THE TAB BAR — losing the iOS 26 minimise-on-scroll
 * behaviour along with it — where specs 7 describes the library as a place the
 * Journal leads to, not a task that takes over the screen.
 *
 * Inside the tab's stack the bar stays, the back gesture is the system's, and
 * one rule holds across the slice: browsing is a push, adding is a modal.
 *
 * Section 3's tree has been diverged from before, with the same kind of note:
 * version-guard.ts, database-gate.tsx, core/id/, core/format/, core/query/ and
 * the two slice-2 modules are all absent from it.
 */
export default LibraryScreen;
