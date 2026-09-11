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
}: {
  children: ReactNode;
  onDelete: () => void;
  actionLabel?: string;
}) {
  const theme = useTheme();
  const [revealed, setRevealed] = useState(false);
  const offset = useRef(new Animated.Value(0)).current;

  function slideTo(value: number): void {
    Animated.timing(offset, {
      toValue: value,
      duration: 160,
      useNativeDriver: true,
    }).start();
  }

  function open(): void {
    setRevealed(true);
    slideTo(-ACTION_WIDTH);
  }

  function close(): void {
    setRevealed(false);
    slideTo(0);
  }

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-20, 20])
    .onEnd((event) => {
      if (event.translationX < -FULL_SWIPE_THRESHOLD) {
        onDelete();
        return;
      }
      if (event.translationX < -REVEAL_THRESHOLD) {
        open();
        return;
      }
      if (event.translationX > REVEAL_THRESHOLD) {
        close();
      }
    });

  return (
    <View style={styles.container}>
      <View style={[styles.action, { backgroundColor: theme.colors.danger }]}>
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
    alignItems: 'flex-end',
  },
  actionPress: { width: ACTION_WIDTH, height: '100%', alignItems: 'center', justifyContent: 'center' },
  actionLabel: { fontSize: 14, fontWeight: '600' },
});
