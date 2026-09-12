import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/core/theme';

/**
 * Drag from the left edge to go back, for a step that is not a route.
 *
 * ## Why this has to exist at all
 *
 * The system gives every pushed screen an interactive back gesture for free.
 * The add screen's inner steps — choosing a quantity, typing a free entry,
 * reading the basket — are STATE rather than routes, deliberately: D16 budgets
 * 0,2 s from choosing a food to the quantity screen, and swapping the content
 * of a panel already on screen costs a render where a navigation costs a
 * presentation. The cost of that choice is exactly this: no gesture comes with
 * it, so the gesture is written.
 *
 * ## BOTH LAYERS MOVE, WHICH IS THE WHOLE EFFECT
 *
 * A top view sliding off to reveal nothing reads as a card being thrown away.
 * What iOS does — in Settings, in Files, everywhere — is move two screens at
 * once: the one leaving travels the full width under the finger, and the one
 * arriving comes from about a third of the screen back, at a third of the
 * speed. The eye reads that as one surface sliding off another, and it is what
 * makes the destination feel like it was there all along rather than being
 * built on release.
 *
 * So the caller hands over what is BEHIND as well, and it is mounted the whole
 * time. That costs a second render of the list while a step is open — cheap,
 * since its queries are cached — and buys a gesture that shows where it is
 * going while it goes there.
 *
 * To be plain, since the system's behaviour is what was asked for: React
 * Native exposes no way to borrow UIKit's own interactive pop for a view that
 * is not a view controller. This follows its shape and its proportions; it is
 * a reconstruction, not the system's.
 *
 * ## GIVE IT A KEY PER STEP. THIS IS NOT OPTIONAL.
 *
 * The exit animation carries the leaving layer all the way off screen and only
 * THEN reports, so at the moment the caller swaps its content the drag is
 * still at full width. If the next step renders a SwipeBack at the same
 * position in the same parent, React updates this one instead of mounting a
 * new one -- the shared value survives, and the arriving step is born pushed
 * off screen with the layer behind it fully revealed in its place.
 *
 * It cost a bug that read as a wrong destination: going back from correcting a
 * basket line landed on the food list. It had not; the basket was there, one
 * screen-width to the right, and what showed was the layer behind it.
 *
 * Resetting after the call is not the fix -- the value would reach the screen
 * a frame before React commits the new content, flashing the step just left.
 * A key makes the reset and the swap the same commit.
 *
 * ## Why it starts at the edge
 *
 * `activeOffsetX` alone would claim any rightward drag, and these steps
 * contain a scroll view, a basket whose rows are themselves swiped, and a
 * keyboard. Requiring the touch to begin within the leading strip is what
 * keeps all of those working: everything further in belongs to whatever is
 * under the finger.
 */

/** Wide enough to find without looking, narrow enough to leave content alone. */
const EDGE_WIDTH = 28;
/** Past a third of the screen, the intent is not in doubt. */
const COMMIT_FRACTION = 1 / 3;
const FLICK_VELOCITY = 600;
/** How far back the arriving layer starts, as a share of the width. iOS: ~30%. */
const PARALLAX = 0.3;

export function SwipeBack({
  onBack,
  behind,
  children,
}: {
  onBack: () => void;
  /** What the gesture reveals. Mounted throughout, so it can move with it. */
  behind: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const drag = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX(12)
    // Leftward movement is not a back gesture, and claiming it would fight the
    // rows that swipe left to delete inside.
    .failOffsetX(-12)
    .onBegin((event) => {
      // Anything that does not start at the edge is somebody else's gesture.
      if (event.x > EDGE_WIDTH) drag.value = -1;
    })
    .onUpdate((event) => {
      if (drag.value === -1) return;
      drag.value = Math.max(0, event.translationX);
    })
    .onEnd((event) => {
      if (drag.value === -1) {
        drag.value = 0;
        return;
      }
      if (event.translationX > width * COMMIT_FRACTION || event.velocityX > FLICK_VELOCITY) {
        // Carries on out rather than snapping back first, then reports — the
        // step is swapped underneath while the content is already off screen.
        drag.value = withTiming(width, { duration: 160 }, (finished) => {
          if (finished === true) runOnJS(onBack)();
        });
        return;
      }
      drag.value = withTiming(0, { duration: 180 });
    });

  const leavingStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, drag.value) }],
  }));

  const arrivingStyle = useAnimatedStyle(() => {
    const progress = Math.min(1, Math.max(0, drag.value) / width);
    return { transform: [{ translateX: -PARALLAX * width * (1 - progress) }] };
  });

  return (
    <Animated.View style={styles.fill}>
      {/*
        Inert while it is behind: a tap landing on a half-revealed list would
        act on something the finger cannot fully see.
      */}
      <Animated.View style={[styles.layer, arrivingStyle]} pointerEvents="none">
        {behind}
      </Animated.View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.layer,
            // Opaque, or the layer underneath shows through the one on top and
            // the parallax reads as two lists at once.
            { backgroundColor: theme.colors.background },
            leavingStyle,
          ]}
        >
          {/*
            The separation between the two layers, at rest one point off the
            left of the screen and so invisible until the layer moves. It
            travels with what it separates, which is the whole trick.
          */}
          <View style={[styles.edge, { backgroundColor: theme.colors.border }]} />
          {children}
        </Animated.View>
      </GestureDetector>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  layer: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  // This was a shadow, as iOS draws one down the leading side of a screen that
  // is leaving. It is a hairline now.
  //
  // THE BLUR SPILLED THE WAY IT WAS NOT WANTED. shadowRadius spreads on all
  // four sides whatever the offset, so a shadow meant for the leading edge
  // also rose above the top of the layer -- and this layer begins just under a
  // transparent header, so it read as a smudge across the back and cancel
  // buttons. Clipping it was not available either: a shadow is drawn OUTSIDE
  // the view's own bounds, so a parent with overflow hidden takes all of it
  // and not only the part that spills.
  //
  // A hairline cannot spill: it is a view, with four edges, exactly as tall as
  // what it separates.
  edge: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: -StyleSheet.hairlineWidth,
    width: StyleSheet.hairlineWidth,
  },
});
