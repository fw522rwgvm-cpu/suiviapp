/**
 * How long a stats panel holds its loading indicator once it has shown one.
 *
 * ## THE FLICKER IS THE DEFECT, NOT THE WAIT
 *
 * A panel's queries answer in whatever time SQLite takes over ninety days of
 * rows — long enough to be seen on a first visit, short enough that what is
 * seen is a flash. A flash reads as a glitch, so the page looks broken exactly
 * once per range, on the visit where nothing is cached yet.
 *
 * Slice 3 met this on the day carousel and answered it with useMinimumVisible;
 * this is the same answer with a shorter floor. Five hundred rather than the
 * carousel's thousand because a panel is SWITCHED TO, not swiped through: the
 * person has just tapped a control and is waiting for it, where a swiped day
 * is meant to feel continuous.
 *
 * ## IT COSTS NOTHING ON A CACHED PANEL, AND THAT IS THE WHOLE DESIGN
 *
 * useMinimumVisible imposes a floor only once the waiting has actually begun.
 * A range already read is rendered on the first frame with no indicator at all,
 * so going back to it stays instant. Half a second is only ever spent where
 * there was already a wait.
 *
 * Chosen, not measured. The way to know it is wrong is to switch ranges on a
 * long history and see whether it still flickers, or starts to feel slow.
 */
export const PANEL_LOADING_MS = 500;
