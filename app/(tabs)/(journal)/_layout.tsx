import { Stack } from 'expo-router';

/**
 * A native stack inside the Journal tab, so the screen gets a system header.
 *
 * NativeTabs supplies no header of its own, and slice 1 gives the Journal
 * something a header is for: the date being looked at, and the previous/next
 * navigation of specs 8.3. The iOS 26 direction settles where it goes — the
 * chrome belongs to the system, configured rather than painted — and the same
 * header is where slice 3 will put the library icon of specs 7.
 *
 * The group parentheses matter: (journal) adds no path segment, so this screen
 * stays the tabs group's index route rather than moving to /journal.
 *
 * The background is deliberately not set. Painting it would make the header
 * opaque and defeat the Liquid Glass treatment UIKit applies to its own
 * controls.
 *
 * Route wiring only (D10).
 */
export default function JournalLayout() {
  return <Stack />;
}
