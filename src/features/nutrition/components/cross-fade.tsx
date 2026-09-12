import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

/**
 * One control becoming another, rather than being replaced between two frames.
 *
 * A header action that changes meaning -- the basket count becoming a way back
 * -- swaps in a single frame if nothing is done, and a control that changes
 * without moving reads as a glitch rather than as a change of state. Fading
 * one into the other is what says these are two states of one thing.
 *
 * TO BE PLAIN ABOUT WHAT THIS IS: iOS 26 morphs its own toolbar items, and
 * React Native exposes none of that for a view drawn in JavaScript -- the
 * header action here is a Pressable around a glass view, not a UIBarButtonItem.
 * This is two opacities crossing. It follows the shape of the system's
 * behaviour without being it, the same reserve the swipe gestures carry.
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
 * widening the slot and shifting the arriving control sideways as the other
 * goes -- the jitter this exists to remove. So the one arriving sizes the
 * container, and the one leaving is laid over it and takes no space.
 *
 * Moves to core/ui at its second real user, per the project rule.
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

  useEffect(() => {
    // Deliberately keyed on the id alone. `children` is a fresh element on
    // every render, so watching it would restart the fade forever.
    if (shown.current.id === id) {
      shown.current = { id, node: children };
      return;
    }

    const previous = shown.current;
    shown.current = { id, node: children };
    setLeaving(previous);
    setToward((end) => (end === 1 ? 0 : 1));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

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
  // Hugs its own content rather than filling the container: the container is
  // sized by whatever is arriving, which may well be narrower.
  leaving: { position: 'absolute', left: 0, top: 0 },
});
