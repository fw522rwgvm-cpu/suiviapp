import { PastSessionScreen } from '@/features/strength/screens/past-session-screen';

/**
 * The page of a finished session (specs 10.5).
 *
 * A SIBLING of training/session.tsx, which is the LIVE one and takes no id:
 * there is only ever one session in progress (D12), so it is "the" session and
 * needs no identifier, while a finished one is one of many. Two routes rather
 * than one that branches on a status, because they are two destinations —
 * the banner leads to the first and the Séances list to the second.
 *
 * Route wiring only (D10).
 */
export default PastSessionScreen;
