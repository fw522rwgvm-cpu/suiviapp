import type { ReactNode } from 'react';
import { StyleSheet, useWindowDimensions } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
 * To be plain about it, since the system's behaviour is what was asked for:
 * React Native exposes no way to borrow UIKit's own interactive pop for a view
 * that is not a view controller. This follows its shape — start at the edge,
 * follow the finger, commit past a third of the screen or on a flick — but it
 * is a reconstruction, not the system's.
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

export function SwipeBack({ onBack, children }: { onBack: () => void; children: ReactNode }) {
  const { width } = useWindowDimensions();
  const drag = useSharedValue(0);

  const pan = Gesture.Pan()
    .activeOffsetX(12)
    // Leftward movement is not a back gesture, and claiming it would fight the
    // day carousel behind and the rows that swipe inside.
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

  const style = useAnimatedStyle(() => ({
    transform: [{ translateX: Math.max(0, drag.value) }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View style={[styles.fill, style]}>{children}</Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
});
