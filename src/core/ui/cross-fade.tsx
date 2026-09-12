import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

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
 * The first attempt cross-faded two whole GlassButtons and did not visibly
 * fade at all on the device. The material is the reason: Liquid Glass is a
 * UIVisualEffectView, and a visual effect view does not dim through a parent's
 * opacity the way an ordinary view does -- Apple's own way of removing one is
 * to drop its effect, not to fade it.
 *
 * So the glass stays. ONE button is mounted for both meanings, and only its
 * symbol and label cross here, which are ordinary views and fade like any
 * other. What this cannot hide is the width: the button is round with a symbol
 * alone and a pill with a label, and that change lands in one frame.
 *
 * TO BE PLAIN ABOUT WHAT THIS IS: iOS 26 morphs its own toolbar items, and
 * React Native exposes none of that for a view drawn in JavaScript -- the
 * header action here is a Pressable around a glass view, not a UIBarButtonItem.
 * This is two opacities crossing. It follows the shape of the system's
 * behaviour without being it, the same reserve the swipe gestures carry.
 *
 * Lives in core/ui before its second user, against the project rule, because
 * the direction of imports leaves nowhere else: GlassButton is what uses it.
 *
 * ## IT NEVER RESETS THE VALUE, AND THAT IS THE WHOLE DESIGN
 *
 * The obvious shape -- put the fade back to 0, then animate it to 1 -- writes
 * a shared value twice in one tick, and a first version doing exactly that did
 * not animate at all. Every animation in this project that works writes ONCE
 * (see OverlayPanel), so this does too.
 *
 * Instead the fade rests at one end and travels to the other on each change,
 * alternating: 1, then 0, then 1. Which end means "arrived" alternates with
 * it, hence `toward`. There is no reset to lose, no ordering between two
 * writes to get right, and the value is always genuinely moving.
 *
 * ## The outgoing copy is absolute, and the incoming one is not
 *
 * Both in normal flow would put them side by side for the length of the fade,
 * widening the slot and shifting the arriving one sideways as the other goes.
 * So the one arriving sizes the box, and the one leaving is laid over it,
 * centred on it, taking no space of its own.
 *
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
  /** Which end of the travel means "fully arrived", this time round. */
  const [toward, setToward] = useState<0 | 1>(1);
  const [leaving, setLeaving] = useState<Frame | null>(null);
  const shown = useRef<Frame>({ id, node: children });
  const fade = useSharedValue(1);

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
    setToward((end) => (end === 1 ? 0 : 1));
  });

  useEffect(() => {
    // In its own effect so it runs AFTER the render that flipped `toward`:
    // the styles below read that value, and animating before they had it
    // would play one frame inverted.
    fade.value = withTiming(toward, { duration, easing: Easing.inOut(Easing.quad) });

    // The outgoing copy is dropped once it is invisible. Left mounted it would
    // keep a control that is no longer true in the tree, where a screen reader
    // would still find it.
    const timer = setTimeout(() => setLeaving(null), duration);
    return () => clearTimeout(timer);
  }, [toward, duration, fade]);

  const arriving = useAnimatedStyle(() => ({
    opacity: toward === 1 ? fade.value : 1 - fade.value,
  }));
  const departing = useAnimatedStyle(() => ({
    opacity: toward === 1 ? 1 - fade.value : fade.value,
  }));

  return (
    <View>
      <Animated.View style={arriving}>{children}</Animated.View>
      {leaving === null ? null : (
        // Inert: it is on its way out, and a touch landing on a control that
        // is half gone would act on a state that no longer holds.
        <Animated.View style={[styles.leaving, departing]} pointerEvents="none">
          {leaving.node}
        </Animated.View>
      )}
    </View>
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
