import { useEffect } from 'react';
import {
  Modal,
  Pressable,
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import type { LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { MonthCalendar } from './month-calendar';

/**
 * The date picker, as a window that grows out of the calendar button and folds
 * back into it (specs 8.3: direct access to a date).
 *
 * ## Why it is anchored by measurement rather than by arithmetic
 *
 * "Out of the button" only reads as true if it starts where the button
 * actually is. That position depends on the safe area, the navigation bar
 * height, and the device — three numbers that would have to be guessed and
 * would be wrong on one phone in three. So the caller measures the button in
 * window coordinates at the moment of the tap and hands the rectangle over.
 * Nothing here is a magic number.
 *
 * transformOrigin does the rest: scaling from the top-right corner is what
 * makes the window appear to come from a point rather than from its own
 * middle, and reversing it is what makes it fold back into the button.
 *
 * ## Why the closing animation lives inside
 *
 * Every way out — the two buttons, picking a date, the swipe, the backdrop —
 * has to play the same animation before the modal is unmounted. If the parent
 * flipped `visible` to false, React would tear the window off the screen mid
 * flight. So the parent's callbacks are wrapped: the window animates itself
 * shut and then reports.
 *
 * The gesture runs on the UI thread as a worklet, like the day carousel, so a
 * drag follows the finger even while React is busy.
 */

const OPEN: WithTimingConfig = { duration: 200 };
const SHUT: WithTimingConfig = { duration: 160 };

/** Far enough to be a decision rather than a twitch. */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 700;

export interface PopoverAnchor {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function CalendarPopover({
  visible,
  anchor,
  month,
  selected,
  today,
  onMonthChange,
  onSelect,
  onToday,
  onClose,
}: {
  visible: boolean;
  /** The button's rectangle, in window coordinates. Null before the first tap. */
  anchor: PopoverAnchor | null;
  month: LocalDate;
  selected: LocalDate;
  today: LocalDate;
  onMonthChange: (month: LocalDate) => void;
  onSelect: (date: LocalDate) => void;
  onToday: () => void;
  onClose: () => void;
}) {
  const theme = useTheme();
  const { width } = useWindowDimensions();

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      drag.value = 0;
      progress.value = withTiming(1, OPEN);
    }
  }, [visible, progress, drag]);

  /** Folds the window back into the button, then reports. */
  function dismiss(then?: () => void): void {
    progress.value = withTiming(0, SHUT, (finished) => {
      if (finished === true) {
        runOnJS(onClose)();
        if (then !== undefined) runOnJS(then)();
      }
    });
  }

  const pan = Gesture.Pan()
    .activeOffsetY(12)
    // Downward only: dragging up is not a dismissal, and claiming that
    // direction would fight the month grid underneath.
    .failOffsetY(-12)
    .onUpdate((event) => {
      drag.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        runOnJS(dismiss)();
        return;
      }
      drag.value = withTiming(0, OPEN);
    });

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.28 }));

  const windowStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [
      { translateY: drag.value },
      // Starts at a fifth of its size, so it reads as coming from the button
      // rather than merely fading in on the spot.
      { scale: 0.2 + progress.value * 0.8 },
    ],
  }));

  if (anchor === null) return null;

  // Below the button, and right-aligned with it: the window hangs from the
  // corner it grows out of.
  const top = anchor.y + anchor.height + 6;
  const right = Math.max(8, width - (anchor.x + anchor.width));

  return (
    <Modal
      visible={visible}
      transparent
      // The animation is ours, from the button. The system's would slide the
      // whole thing up from the bottom and undo the point of anchoring it.
      animationType="none"
      onRequestClose={() => dismiss()}
      statusBarTranslucent
    >
      <Pressable style={styles.fill} onPress={() => dismiss()} accessibilityLabel="Fermer">
        <Animated.View style={[styles.fill, styles.backdrop, backdropStyle]} />
      </Pressable>

      <GestureDetector gesture={pan}>
        <Animated.View
          style={[
            styles.window,
            {
              top,
              right,
              maxWidth: width - right - 8,
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderRadius: theme.radius.xl,
              // Grows out of its top-right corner, which is where the button is.
              transformOrigin: 'top right',
              ...theme.shadow,
              // The popover floats over content rather than sitting on the
              // page, so it carries its own lift even in the dark, where cards
              // deliberately have none.
              shadowOpacity: theme.scheme === 'dark' ? 0.5 : 0.18,
              shadowRadius: 24,
            },
            windowStyle,
          ]}
        >
          <View style={styles.actions}>
            <Pressable
              onPress={() => dismiss(onToday)}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.action}
            >
              <Text style={[styles.actionLabel, { color: theme.colors.accent }]}>
                Aujourd’hui
              </Text>
            </Pressable>

            <Pressable
              onPress={() => dismiss()}
              hitSlop={8}
              accessibilityRole="button"
              style={styles.action}
            >
              <Text style={[styles.actionLabel, { color: theme.colors.accent }]}>Fermer</Text>
            </Pressable>
          </View>

          {/* The grab handle says the window can be pushed away. */}
          <View style={[styles.grip, { backgroundColor: theme.colors.border }]} />

          <MonthCalendar
            month={month}
            selected={selected}
            today={today}
            onMonthChange={onMonthChange}
            onSelect={(date) => dismiss(() => onSelect(date))}
          />
        </Animated.View>
      </GestureDetector>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { backgroundColor: '#000000' },
  window: {
    position: 'absolute',
    width: 340,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingBottom: 14,
    paddingTop: 6,
    overflow: 'hidden',
  },
  actions: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  action: { paddingVertical: 8, paddingHorizontal: 4 },
  actionLabel: { fontSize: 17 },
  grip: { alignSelf: 'center', width: 36, height: 4, borderRadius: 2, marginBottom: 6 },
});
