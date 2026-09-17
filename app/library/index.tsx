import { LibraryScreen } from '@/features/nutrition/screens/library-screen';

/**
 * Route wiring only (D10).
 *
 * BACK WHERE SECTION 3 DREW IT, at app/library/, and declared on the ROOT stack
 * so that it covers the tab bar. Slice 3 had moved it into the Journal's stack
 * so that it would not; requested the other way (specs 14.24), and the whole
 * reasoning — including why there is no _layout.tsx here — lives in
 * app/_layout.tsx beside the declaration.
 */
export default LibraryScreen;
