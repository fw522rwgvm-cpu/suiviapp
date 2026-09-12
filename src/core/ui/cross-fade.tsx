import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

/**
 * One piece of content becoming another, rather than being replaced between
 * two frames.
 *
 * A header action that changes meaning -- the basket count becoming a way back
 * -- swaps in a single frame if nothing is done, and a control that changes
 * without moving reads as a glitch rather than as a change of state.
 *
 * ## IT FADES WHAT IS INSIDE A GLASS BUTTON, NOT THE BUTTON
 *
 * An attempt that cross-faded two whole GlassButtons did not visibly fade on
 * the device. The material is the reason: Liquid Glass is a
 * UIVisualEffectView, and a visual effect view does not dim through a parent's
 * opacity the way an ordinary view does -- Apple's own way of removing one is
 * to drop its effect, not to fade it.
 *
 * So the glass stays. ONE button is mounted for both meanings, and only its
 * symbol and label cross here, which are ordinary views. What this cannot hide
 * is the width: the button is round with a symbol alone and a pill with a
 * label, and that change lands in one frame.
 *
 * ## EACH FADE BELONGS TO A FRESHLY MOUNTED VIEW. THIS IS THE WHOLE DESIGN.
 *
 * Two earlier versions animated a single shared value back and forth across
 * transitions, and neither animated on the device -- once by resetting the
 * value and writing twice in a tick, once by alternating which end meant
 * "arrived" and letting the style worklet close over that piece of React
 * state.
 *
 * What works in this project, everywhere it works, is one exact shape, and
 * OverlayPanel is the reference for it: a shared value created AT ITS STARTING
 * VALUE, ONE write in a mount effect, and a style worklet that closes over
 * nothing but the shared value. Nothing to reset, no state in the worklet, no
 * ordering between writes, and no easing built on the JavaScript side to be
 * carried across to the other runtime.
 *
 * So each side of the crossing is its own little component, mounted for the
 * length of one transition and never asked to animate twice. Keyed on the
 * turn, so a change of MEANING mounts a new pair, while a change of wording --
 * the count going from 2 to 3 -- passes straight through without remounting
 * and therefore without a fade, which is what it should do.
 *
 * TO BE PLAIN ABOUT WHAT THIS IS: iOS 26 morphs its own toolbar items, and
 * React Native exposes none of that for a view drawn in JavaScript. This is
 * two opacities crossing -- the shape of the system's behaviour, not the
 * behaviour itself, the same reserve the swipe gestures carry.
 *
 * Lives in core/ui before its second user, against the project rule, because
 * the direction of imports leaves nowhere else: GlassButton is what uses it.
 */

interface Frame {
  id: string;
  node: ReactNode;
}

export function CrossFade({
  id,
  children,
  duration = 220,
}: {
  /** What is being shown. A change here is what starts the fade. */
  id: string;
  children: ReactNode;
  duration?: number;
}) {
  /** Counts transitions, and so gives each pair of fades its own identity. */
  const [turn, setTurn] = useState(0);
  const [leaving, setLeaving] = useState<Frame | null>(null);
  const shown = useRef<Frame>({ id, node: children });

  // After EVERY render, deliberately. Watching `children` as a dependency
  // would restart the fade on every render, since it is a fresh element each
  // time; watching only the id would let the copy go stale, and the count
  // fading out would be the one from two changes ago. So: run always, and let
  // the id decide which of the two things to do.
  useEffect(() => {
    if (shown.current.id === id) {
      shown.current = { id, node: children };
      return;
    }
    const previous = shown.current;
    shown.current = { id, node: children };
    setLeaving(previous);
    setTurn((count) => count + 1);
  });

  useEffect(() => {
    if (leaving === null) return;
    // Dropped once it is invisible. Left mounted it would keep a control that
    // is no longer true in the tree, where a screen reader would still find it.
    const timer = setTimeout(() => setLeaving(null), duration);
    return () => clearTimeout(timer);
  }, [leaving, duration]);

  return (
    <View>
      <Fade key={turn} to={1} duration={duration}>
        {children}
      </Fade>

      {leaving === null ? null : (
        <Fade key={`out-${turn}`} to={0} duration={duration} style={styles.leaving}>
          {leaving.node}
        </Fade>
      )}
    </View>
  );
}

/**
 * One view, one journey, decided when it mounts and never revisited.
 *
 * `to` is fixed for the life of the instance -- a new meaning mounts a new
 * pair rather than turning these round, which is what keeps the write on the
 * shared value to exactly one.
 */
function Fade({
  to,
  duration,
  style,
  children,
}: {
  to: 0 | 1;
  duration: number;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}) {
  const opacity = useSharedValue(to === 1 ? 0 : 1);

  useEffect(() => {
    opacity.value = withTiming(to, { duration });
  }, [opacity, to, duration]);

  const fading = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    // The one on its way out is inert: a touch landing on a control that is
    // half gone would act on a state that no longer holds.
    <Animated.View style={[style, fading]} pointerEvents={to === 1 ? 'auto' : 'none'}>
      {children}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  // Fills the box the arriving content just defined, and CENTRES the outgoing
  // copy on it. The two are rarely the same width -- a symbol with a number
  // beside it against a symbol alone -- and the wider one is clipped by the
  // button around it. Clipped evenly on both sides it reads as a fade;
  // anchored to one edge it reads as something sliding out of place.
  leaving: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
