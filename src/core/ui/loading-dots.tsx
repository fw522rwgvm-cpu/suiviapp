import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useTheme } from '@/core/theme';

/**
 * Three dots that say a page is still coming.
 *
 * Lives in core/ui rather than in nutrition because waiting is not a nutrition
 * idea: the statistics of slice 7 and the history of slice 12 will wait on
 * exactly the same kind of query. It is written here at its first user, which
 * bends the second-user rule — the justification being that a spinner is
 * chrome, with no domain in it at all.
 *
 * WHY IT IS USUALLY INVISIBLE, AND WHY IT STILL HAS TO EXIST. SQLite is
 * synchronous and local, so a day almost always renders on the first frame,
 * and React Query keeps the two neighbouring days warm — swiping normally hits
 * the cache. What is left is the cold case: a day far from anything cached, on
 * a long history, reached from the calendar. Showing nothing there reads as a
 * broken screen rather than a busy one.
 *
 * The animation runs on the UI thread as a worklet, which is the whole point:
 * an indicator driven from the JS thread freezes exactly when the JS thread is
 * busy — that is, while the thing it is reporting on is happening.
 */

const DURATION = 320;
const STAGGER = 140;

export function LoadingDots({ label = 'Chargement' }: { label?: string }) {
  const theme = useTheme();

  return (
    <View
      style={styles.row}
      accessibilityRole="progressbar"
      accessibilityLabel={label}
    >
      <Dot delay={0} color={theme.colors.textFaint} />
      <Dot delay={STAGGER} color={theme.colors.textFaint} />
      <Dot delay={STAGGER * 2} color={theme.colors.textFaint} />
    </View>
  );
}

function Dot({ delay, color }: { delay: number; color: string }) {
  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withDelay(
      delay,
      // -1 repeats for ever; false means it restarts rather than reversing, so
      // the three stay staggered instead of drifting into step.
      withRepeat(
        withSequence(
          withTiming(1, { duration: DURATION }),
          withTiming(0, { duration: DURATION }),
        ),
        -1,
        false,
      ),
    );
  }, [delay, progress]);

  const style = useAnimatedStyle(() => ({
    opacity: 0.3 + progress.value * 0.7,
    transform: [{ scale: 0.8 + progress.value * 0.35 }],
  }));

  return <Animated.View style={[styles.dot, { backgroundColor: color }, style]} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 4.5 },
});
