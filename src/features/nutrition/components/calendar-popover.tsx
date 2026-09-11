import { GlassView } from 'expo-glass-effect';
import { SymbolView } from 'expo-symbols';
import { useEffect } from 'react';
import { Modal, Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import type { LocalDate } from '@/core/date';
import { useTheme } from '@/core/theme';
import { canUseGlass, GlassButton } from '@/core/ui/glass-button';
import { MonthCalendar } from './month-calendar';

/**
 * The date picker: the calendar button itself, growing into a window and
 * shrinking back into a button (specs 8.3, direct access to a date).
 *
 * ## It is a morph, not an appearance
 *
 * The difference is the whole effect. Scaling a window up from a point looks
 * like a window arriving near a button; interpolating its ACTUAL GEOMETRY —
 * left, top, width, height, corner radius — from the button's rectangle to the
 * window's makes it the same object throughout. At rest it is a 38-point circle
 * exactly where the button is, showing a calendar glyph. There is nothing else
 * on screen it could be.
 *
 * Three details make it hold together, and each is invisible until missing:
 *
 *  - the REAL button is hidden while this is open. Otherwise the morph slides
 *    off it and reveals the thing it is pretending to be, standing still.
 *  - the content fades in only after the shape has most of its size, so the
 *    month grid is never seen crushed into a circle.
 *  - the glyph fades out early, over the same few frames, so one replaces the
 *    other rather than both being there at once.
 *
 * Animating layout properties rather than a transform is deliberate. A scale
 * would stretch the corner radius into ellipses and squash the content with it.
 * It costs a layout pass per frame on a single view for a fifth of a second,
 * which is the right trade here.
 *
 * ## Why the closing animation lives inside
 *
 * Every way out — the two buttons, picking a date, the swipe, the backdrop —
 * has to play the same morph before the modal is unmounted. If the parent
 * flipped `visible` to false, React would tear the window off the screen mid
 * flight. So the parent's callbacks are wrapped: the window animates itself
 * shut and then reports.
 *
 * The gesture runs on the UI thread as a worklet, like the day carousel, so a
 * drag follows the finger even while React is busy.
 */

const OPEN: WithTimingConfig = { duration: 260 };
const SHUT: WithTimingConfig = { duration: 200 };

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
  const { width, height } = useWindowDimensions();
  const glass = canUseGlass();

  const progress = useSharedValue(0);
  const drag = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      drag.value = 0;
      progress.value = withTiming(1, OPEN);
    }
  }, [visible, progress, drag]);

  /** Shrinks the window back into the button, then reports. */
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

  // Declared before the early return so the hooks below always run: anchor is
  // null only until the first tap, and hook order may not depend on it.
  const from = anchor ?? { x: 0, y: 0, width: 0, height: 0 };
  const openTop = from.y + from.height + 6;
  // A little past the bottom edge, so the rounded bottom corners fall off
  // screen rather than cutting a notch out of the window.
  const openHeight = height - openTop + theme.radius.xl;

  const windowStyle = useAnimatedStyle(() => {
    const ratio = progress.value;
    return {
      left: interpolate(ratio, [0, 1], [from.x, 0]),
      top: interpolate(ratio, [0, 1], [from.y, openTop]),
      width: interpolate(ratio, [0, 1], [from.width, width]),
      height: interpolate(ratio, [0, 1], [from.height, openHeight]),
      // Starts as a circle — half the button's height — and opens out to the
      // window's corner. The same value on all four corners throughout, which
      // is what keeps it a single continuous shape.
      borderRadius: interpolate(ratio, [0, 1], [from.height / 2, theme.radius.xl]),
      transform: [{ translateY: drag.value }],
    };
  });

  // Late, so the grid is never seen crushed into a circle.
  const contentStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0.55, 1], [0, 1], Extrapolation.CLAMP),
  }));

  // Early, so the glyph and the content never overlap.
  const glyphStyle = useAnimatedStyle(() => ({
    opacity: interpolate(progress.value, [0, 0.3], [1, 0], Extrapolation.CLAMP),
  }));

  if (anchor === null) return null;

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
              borderColor: theme.colors.border,
              // No background when the material is real: opacity is exactly
              // what cancels it. The fallback paints, because it is not glass.
              backgroundColor: glass ? 'transparent' : theme.colors.surface,
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
            THE MATERIAL, AS A FILL RATHER THAN AS THE ANIMATED VIEW ITSELF.

            GlassView is a native view; driving its layout props from a worklet
            frame by frame is not something it promises to survive. So the
            animation stays on a plain Animated.View, which clips — overflow
            hidden with an animated corner radius — and the glass simply fills
            it. The shape morphs, the material is genuinely the system's, and
            neither has to know about the other.
          */}
          {glass ? (
            <GlassView
              style={StyleSheet.absoluteFill}
              glassEffectStyle="regular"
              pointerEvents="none"
            />
          ) : null}

          {/* What the button looked like, on its way out. */}
          <Animated.View style={[styles.glyph, glyphStyle]} pointerEvents="none">
            <SymbolView name="calendar" size={20} tintColor={theme.colors.accent} />
          </Animated.View>

          <Animated.View style={[styles.content, contentStyle]}>
            {/*
              Words, not symbols. "Fermer" reads as a cross well enough, but no
              glyph says "go back to today" without being learnt first — the
              uturn arrow that stood here said "undo" to anyone who had not
              been told. And they are glass, the same material UIKit gives the
              native header's back button and its "+".
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
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  glyph: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  content: { paddingHorizontal: 16, paddingTop: 10 },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    // The calendar needs air under the buttons: side by side they read as one
    // block, and the grid below starts being mistaken for part of it.
    marginBottom: 22,
  },
});
