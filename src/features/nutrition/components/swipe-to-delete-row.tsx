import { useRef, useState, type ReactNode } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useTheme } from '@/core/theme';

/**
 * Swipe left to delete (specs 8.3).
 *
 * Written by hand: D10 rules out component libraries precisely because the
 * screens that matter here — the progress ring, the RIR row, swipe to delete,
 * the session banner — are all bespoke, and a library brings none of them.
 *
 * Two deliberate implementation choices, both about not being able to compile
 * locally:
 *
 *  - the gesture runs on the JS thread (`runOnJS`). Gesture Handler otherwise
 *    workletises its callbacks, which pulls in the Reanimated worklets plugin
 *    and a Babel step. Section 5 allows Reanimated, but a toolchain failure
 *    there is only diagnosable through a build, and this component does not
 *    need frame-perfect tracking.
 *  - the row does not follow the finger. The gesture decides between three
 *    outcomes on release, and a plain Animated timing on the native driver
 *    moves the row. Core React Native, no plugin, nothing to configure.
 *
 * `activeOffsetX` is what makes it coexist with the vertical list and with the
 * day-to-day swipe: the gesture only claims the touch once the movement is
 * clearly horizontal.
 *
 * ## Two directions, one component
 *
 * The journal swipes LEFT, as specs 8.3 asks. The basket of the add screen
 * swipes RIGHT, because it sits inside a panel where a leftward drag already
 * means something else. Rather than a second component that would drift from
 * this one, the direction is a parameter and the arithmetic is mirrored by a
 * sign.
 *
 * A note on "the native iOS behaviour", since that is what was asked for:
 * React Native exposes no system swipe-actions control, and the library
 * alternatives are themselves JavaScript reimplementations. So this is an
 * emulation either way — and the one already running on the device is the
 * lower-risk emulation to spread.
 */

const ACTION_WIDTH = 92;
/** Past this, the row opens and waits for a tap. */
const REVEAL_THRESHOLD = 40;
/** Past this, the swipe was unambiguous: delete straight away. */
const FULL_SWIPE_THRESHOLD = 160;

export function SwipeToDeleteRow({
  children,
  onDelete,
  actionLabel = 'Supprimer',
  direction = 'left',
}: {
  children: ReactNode;
  onDelete: () => void;
  actionLabel?: string;
  /** Which way the row travels. The action is revealed on the other side. */
  direction?: 'left' | 'right';
}) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);
  const offset = useRef(new Animated.Value(0)).current;
  // -1 for a leftward swipe, 1 for a rightward one. Every distance below is
  // written once, unsigned, and multiplied by this.
  const way = direction === 'left' ? -1 : 1;

  function slideTo(value: number): void {
    Animated.timing(offset, {
      toValue: value,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }

  function open(): void {
    setRevealed(true);
    slideTo(way * ACTION_WIDTH);
  }

  function close(): void {
    setRevealed(false);
    slideTo(0);
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .onEnd((event) => {
      // Measured along the swipe's own direction, so the three outcomes read
      // the same whichever way the row travels.
      const travelled = event.translationX * way;

      if (travelled > FULL_SWIPE_THRESHOLD) {
        onDelete();
        return;
      }
      if (travelled > REVEAL_THRESHOLD) {
        open();
        return;
      }
      if (travelled < -REVEAL_THRESHOLD) {
        close();
      }
    });

  return (
    <View style={styles.container}>
      <View
        style={[
          styles.action,
          { backgroundColor: theme.colors.danger },
          // The action waits on the side the row uncovers.
          { alignItems: direction === 'left' ? 'flex-end' : 'flex-start' },
        ]}
      >
        <Pressable
          onPress={onDelete}
          disabled={!revealed}
          style={styles.actionPress}
          accessibilityRole="button"
          accessibilityLabel={actionLabel}
        >
          <Text style={[styles.actionLabel, { color: theme.colors.onAccent }]}>
            {actionLabel}
          </Text>
        </Pressable>
      </View>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            { backgroundColor: theme.colors.surface },
            { transform: [{ translateX: offset }] },
          ]}
        >
          {/* Tapping an open row closes it rather than triggering the row. */}
          {revealed ? (
            <Pressable onPress={close} accessibilityLabel="Annuler la suppression">
              <View pointerEvents="none">{children}</View>
            </Pressable>
          ) : (
            children
          )}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { overflow: 'hidden' },
  action: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
  },
  actionPress: { width: ACTION_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '600' },
});
