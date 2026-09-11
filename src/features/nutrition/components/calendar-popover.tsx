import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
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
import { GlassButton } from '@/core/ui/glass-button';
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
 * transformOrigin does the rest: the window is full width, so it has no corner
 * near the button to grow from — the origin is computed as the button's
 * horizontal middle instead. Scaling from that point is what makes the window
 * appear to come from somewhere rather than from its own centre, and reversing
 * it is what makes it fold back into the button.
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

  // Below the button, the full width of the screen, and down to the bottom.
  //
  // Full width means the anchoring can no longer come from the corner the
  // window happens to sit in — it has no corner near the button any more. So
  // the transform origin is computed instead: the horizontal middle of the
  // button, measured in the window's own coordinates. Scaling from that point
  // is what keeps "it comes out of the button" true at any width.
  //
  // The height is fixed rather than fitted to the grid on purpose: a month
  // spanning six rows is taller than one spanning five, so a window that hugged
  // its contents would change size as you paged through months — and it would
  // do it while the thing you are aiming at moves. Reaching the bottom edge
  // also means the bottom corners are off-screen, so only the top two are
  // rounded.
  const top = anchor.y + anchor.height + 6;
  const originX = anchor.x + anchor.width / 2;

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
              backgroundColor: theme.colors.surface,
              borderColor: theme.colors.border,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              // Grows out of the button, wherever along the top edge it sits.
              transformOrigin: [originX, 0, 0],
              ...theme.shadow,
              // The window floats over content rather than sitting on the page,
              // so it carries its own lift even in the dark, where cards
              // deliberately have none.
              shadowOpacity: theme.scheme === 'dark' ? 0.5 : 0.18,
              shadowRadius: 24,
            },
            windowStyle,
          ]}
        >
          {/*
            Words, not symbols. "Fermer" reads as a cross well enough, but no
            glyph says "go back to today" without being learnt first — the
            uturn arrow that stood here said "undo" to anyone who had not been
            told. And they are glass, the same material UIKit gives the native
            header's back button and its "+", which is the look being matched.
          */}
          <View style={styles.actions}>
            <GlassButton label="Aujourd’hui" onPress={() => dismiss(onToday)} />
            <GlassButton label="Fermer" onPress={() => dismiss()} />
          </View>

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
    // Full width, and down to the bottom edge: the height never changes with
    // the month, and there are no side gutters to leave the page showing.
    left: 0,
    right: 0,
    bottom: 0,
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 16,
    paddingTop: 8,
    overflow: 'hidden',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
});
