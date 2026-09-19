/**
 * How the two long lists of this application are windowed.
 *
 * ## THIS AMENDS D16, AND THE AMENDMENT IS NARROW
 *
 * D16 refused a virtualised list — "quelques centaines de lignes au plus, vues
 * standard" — and every long list so far answered it by SHOWING FEWER: the
 * catalogue capped at forty, the library capped at forty, both saying so on the
 * page. That worked and it made the user filter before they could browse, which
 * is what was asked to change (specs 14.36).
 *
 * What makes it affordable is that `FlatList` is REACT NATIVE ITSELF, not a
 * specialised list library. No dependency enters, nothing needs a CI cycle, and
 * D16's actual worry — a third-party list engine on the critical path — is
 * untouched. What is dropped is the "vues standard" half of the sentence.
 *
 * ## WHAT EACH NUMBER DOES, BECAUSE THEY ARE NOT INTERCHANGEABLE
 *
 * - `initialNumToRender` — what is drawn before anything is scrolled. This is
 *   the "nombre réduit" of the request, and it is the one that decides how fast
 *   the tab opens.
 * - `maxToRenderPerBatch` with `updateCellsBatchingPeriod` — how many more
 *   arrive per pass while scrolling. Small batches keep each pass short, which
 *   is what stops a scroll from stuttering; the cost is a blank cell for a
 *   frame if you fling hard.
 * - `windowSize` — how much is KEPT MOUNTED around the viewport, counted in
 *   screenfuls. **This is the unloading half of the request**: rows further
 *   away than this are unmounted, and their photographs are released with
 *   them. The default is 21, which on a list of eight hundred rows with an
 *   image each is most of the list.
 *
 * `removeClippedSubviews` is deliberately NOT set. It is a second, blunter
 * mechanism that detaches native views, it is documented as unreliable on iOS,
 * and its failure mode is a blank row that never comes back — where
 * `windowSize` unmounts through React and comes back by rendering. One
 * mechanism, the one that can be reasoned about.
 *
 * ## NO `getItemLayout`, AND THAT IS A CHOICE
 *
 * It would let the list skip measuring and scroll to an index exactly. It also
 * requires every row to be the height the constant claims — and these rows hold
 * a photograph, a star button and two lines of text whose real height nothing
 * here can measure. A wrong `getItemLayout` does not warn: it puts the scroll
 * in the wrong place and drifts further the longer the list. Measuring is the
 * slower, honest option.
 */
export const VIRTUAL_LIST_PROPS = {
  initialNumToRender: 12,
  maxToRenderPerBatch: 8,
  updateCellsBatchingPeriod: 50,
  windowSize: 7,
} as const;
