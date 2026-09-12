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
 * What works in this project, everywhere it works, is one exact shape, and
 * OverlayPanel and LoadingDots are the references for it: a shared value
 * created AT ITS STARTING VALUE, ONE write in a mount effect, and a style
 * worklet that closes over nothing but the shared value. Nothing to reset, no
 * React state inside the worklet, no ordering between two writes, and no
 * easing built on the JavaScript side to be carried to the other runtime.
 *
 * So each side of the crossing is its own little component, mounted for the
 * length of one transition and never asked to animate twice. Keyed on the
 * turn, so a change of MEANING mounts a new pair, while a change of wording --
 * the count going from 2 to 3 -- passes straight through without remounting
 * and therefore without a fade, which is what it should do.
 *
 * ## THE TURN IS COUNTED DURING RENDER, NOT IN AN EFFECT
 *
 * This is what a third failed attempt turned on, and it is invisible until you
 * count frames. An effect runs AFTER its render has been painted. Count the
 * turn there and the new content is first painted under the OLD key -- so it
 * arrives at full opacity, with no fade at all -- and only on the next render
 * does the pair remount and start crossing. What that looks like is the change
 * landing instantly and then wobbling, which is worse than no animation.
 *
 * Adjusting state during render is React's own answer to this: the update is
 * applied and the component re-run before anything reaches the screen, so the
 * arriving view is already mounted at zero in the very first frame that shows
 * the new content.
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

interface Crossing {
  /** Counts changes of meaning, and so gives each pair of fades its identity. */
  turn: number;
  id: string;
  leaving: Frame | null;
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
  const [crossing, setCrossing] = useState<Crossing>(() => ({ turn: 0, id, leaving: null }));

  /** What was on screen a moment ago, kept fresh for when it has to leave. */
  const shown = useRef<Frame>({ id, node: children });

  if (crossing.id !== id) {
    // Adjusted DURING render, so the pair below is already mounted and at zero
    // in the first frame that shows the new content. React re-runs this
    // component immediately; nothing is painted in between.
    setCrossing({ turn: crossing.turn + 1, id, leaving: shown.current });
  }

  // After every render, so the copy that will one day leave is the one that
  // was really last on screen -- not the one from two changes ago, with a
  // count that has since moved on.
  useEffect(() => {
    shown.current = { id, node: children };
  });

  useEffect(() => {
    if (crossing.leaving === null) return;
    // Dropped once it is invisible. Left mounted it would keep a control that
    // is no longer true in the tree, where a screen reader would still find it.
    const timer = setTimeout(
      () => setCrossing((current) => ({ ...current, leaving: null })),
      duration,
    );
    return () => clearTimeout(timer);
  }, [crossing, duration]);

  return (
    <View>
      <Fade key={crossing.turn} to={1} duration={duration}>
        {children}
      </Fade>

      {crossing.leaving === null ? null : (
        <Fade key={`out-${crossing.turn}`} to={0} duration={duration} style={styles.leaving}>
          {crossing.leaving.node}
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
