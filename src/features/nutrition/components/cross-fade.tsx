import { useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';

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
 * ## The outgoing copy is absolute, and the incoming one is not
 *
 * Both in normal flow would put them side by side for the length of the fade,
 * widening the slot and shifting the arriving control sideways as the other
 * goes -- the jitter this exists to remove. So the one arriving sizes the
 * container, and the one leaving is laid over it and takes no space.
 *
 * Opacity is driven by a shared value rather than by entering/exiting layout
 * animations: the outgoing element must be held on screen for a known time,
 * and holding it is simpler than asking a layout animation to delay a removal.
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
  duration = 200,
}: {
  /** What is being shown. A change here is what starts the fade. */
  id: string;
  children: ReactNode;
  duration?: number;
}) {
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
    fade.value = 0;
    fade.value = withTiming(1, { duration });

    // Dropped once it is invisible. Left mounted it would keep a control that
    // is no longer true in the tree, where a screen reader would still find it.
    const timer = setTimeout(() => setLeaving(null), duration);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const arriving = useAnimatedStyle(() => ({ opacity: fade.value }));
  const departing = useAnimatedStyle(() => ({ opacity: 1 - fade.value }));

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
