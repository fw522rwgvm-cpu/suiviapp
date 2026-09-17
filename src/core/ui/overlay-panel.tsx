import { useRouter } from 'expo-router';
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';
import { Pressable, StyleSheet, useWindowDimensions, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type WithTimingConfig,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTheme } from '@/core/theme';

/**
 * A window that opens over the screen behind it, rather than replacing it.
 *
 * ## What it is for
 *
 * A pushed or full-screen route is opaque by definition, so it reads as going
 * somewhere else. Picking a date, correcting a quantity, fixing four numbers —
 * none of those is leaving the day. They are things done ON it, and a panel
 * with the Journal showing behind says so before a single word is read.
 *
 * Used with `presentation: 'transparentModal'`, which keeps the screen beneath
 * mounted and visible, and with `animation: 'none'`, which is the subtle half.
 *
 * ## Why the animation is ours and not the presentation's
 *
 * The window has to rise from the bottom and fall back down; the backdrop has
 * to darken WHERE IT IS. Every built-in presentation moves the whole screen as
 * one, so the dimming veil rose along with the window — which reads as a sheet
 * of dark paper arriving rather than as the room going dim. Fading the screen
 * fixed that and lost the rising.
 *
 * Two movements, two rules, so two animations: the panel translates, the
 * backdrop only changes opacity. Nothing built in expresses that, so the
 * presentation is told to do nothing at all.
 *
 * ## The cost, and how it is paid
 *
 * Doing it here means EVERY way out has to play it — the button, the swipe,
 * the backdrop, and a screen inside that saves and closes itself. A child
 * calling router.back() directly would have the window vanish mid-flight.
 *
 * So the closing function is published on a context, and useDismiss() hands it
 * to whoever asks. Outside a panel the same hook answers with a plain
 * router.back(), which is what lets the very same screens serve as a step
 * inside the add modal, where there is no panel to fold away.
 *
 * ## The drag lives on the actions row, not on the whole panel
 *
 * Dragging anywhere would fight the scroll view inside: two gestures claiming
 * the same downward movement, and the one that wins depends on where the
 * finger happened to land. The top strip is unambiguous — nothing there
 * scrolls — and it is where the hand already goes to dismiss a sheet.
 *
 * ## THE HEADING COMES UP FROM INSIDE, LIKE THE DISMISSAL GOES DOWN
 *
 * What a panel is about is known by the screen in it, not by the route that
 * opened it: the quantity screen learns the food's name from a query of its
 * own. So a child announces its heading through a context, exactly as the
 * closing function is published downward through one.
 *
 * The alternative was to have each caller run the same query again to label a
 * window over a screen already holding the answer — two sources for one name,
 * free to disagree for a frame.
 *
 * It sits on the actions line rather than above it, because that line is the
 * only place in a panel that is not scrollable content: a title that scrolls
 * away is a title you have to scroll back for.
 *
 * Lives in core/ui with three real users on the day it is written — the
 * calendar, the quantity editor and free entry.
 */

const RISE: WithTimingConfig = { duration: 260 };
const FALL: WithTimingConfig = { duration: 200 };

/** Far enough to be a decision rather than a twitch. */
const DISMISS_DISTANCE = 90;
const DISMISS_VELOCITY = 700;

const DismissContext = createContext<(() => void) | null>(null);

/** The guarded way out. Falls back to the plain dismissal when unguarded. */
const RequestCloseContext = createContext<(() => void) | null>(null);

/**
 * How to leave, whatever you are inside.
 *
 * In a panel it folds the window away first; anywhere else it is router.back().
 * Screens call this rather than the router, so that one screen can be both a
 * step in a modal and an overlay route without knowing which it is.
 */
/**
 * Leaving without finishing, which is not the same act as finishing.
 *
 * ## WHY THIS IS NOT useDismiss
 *
 * useDismiss is what a screen calls when it is DONE — a routine created, a
 * quantity confirmed, a food saved. Routing those through the guard would ask
 * "are you sure you want to discard?" immediately after a successful save,
 * which is the guard firing on the one path where there is nothing to lose.
 *
 * So the guard covers the two ways OUT and neither way FINISHED: the trailing
 * action, and the drag. A panel with no guard makes the two identical, which is
 * why nothing had to tell them apart until now.
 */
export function useRequestClose(): () => void {
  const asked = useContext(RequestCloseContext);
  const dismiss = useDismiss();

  return asked ?? dismiss;
}

export function useDismiss(): () => void {
  const inPanel = useContext(DismissContext);
  const router = useRouter();
  return inPanel ?? (() => router.back());
}

/** What the panel says it is about. Announced by whatever is inside it. */
export interface PanelHeading {
  title: string;
  subtitle: string | null;
}

const HeadingContext = createContext<((heading: PanelHeading | null) => void) | null>(null);

/**
 * Names the panel this is inside, for as long as it is inside it.
 *
 * Takes null while the name is still being read, so a window never shows a
 * title it does not have yet. Withdrawn on the way out, so the next step in
 * the same panel does not inherit it.
 *
 * Outside a panel it does nothing at all, which is what lets the same screen
 * serve as a step inside the add modal.
 */
export function usePanelHeading(title: string | null, subtitle: string | null): void {
  const announce = useContext(HeadingContext);

  useEffect(() => {
    if (announce === null) return;
    announce(title === null || title === '' ? null : { title, subtitle });
    return () => announce(null);
    // The pieces, not the object: a fresh object every render would announce
    // the same name for ever.
  }, [announce, title, subtitle]);
}

export function OverlayPanel({
  onDismiss,
  onRequestClose,
  left,
  right,
  children,
}: {
  /** Called once the window has finished folding away. */
  onDismiss: () => void;
  /**
   * A chance to ask before closing, for a window holding work that would be
   * lost (specs 14.26). It is handed the function that actually closes, and
   * calls it or does not.
   *
   * ## BOTH WAYS OUT GO THROUGH IT, WHICH IS THE POINT
   *
   * The button and the drag are one decision — "leave this" — so guarding only
   * the button would leave the gesture as a way to lose the same work without
   * being asked, and the gesture is the easier of the two to do by accident.
   *
   * Absent means what it has always meant: closing closes.
   */
  onRequestClose?: (close: () => void) => void;
  /** Leading action, if the panel has one. */
  left?: ReactNode;
  /** Trailing action — in practice, the way out. */
  right?: ReactNode;
  children: ReactNode;
}) {
  const theme = useTheme();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();

  /** Announced from inside, through the context below. Absent until it is. */
  const [heading, setHeading] = useState<PanelHeading | null>(null);

  // 0 is fully below the screen, 1 is open.
  const progress = useSharedValue(0);
  const drag = useSharedValue(0);
  const travel = height - insets.top;

  useEffect(() => {
    progress.value = withTiming(1, RISE);
  }, [progress]);

  function close(): void {
    progress.value = withTiming(0, FALL, (finished) => {
      if (finished === true) runOnJS(onDismiss)();
    });
  }

  /**
   * What every way out calls. The guard decides; without one this IS close.
   */
  function requestClose(): void {
    if (onRequestClose === undefined) {
      close();
      return;
    }
    onRequestClose(close);
  }

  /*
    A shared value rather than the prop read inside the worklet: the gesture
    runs on the interface thread, and what it can see of a prop is whatever was
    captured when it was built. A basket filling up while the panel is open must
    arm the guard, not the version of it that existed at the first render.
  */
  const guarded = useSharedValue(onRequestClose !== undefined);
  useEffect(() => {
    guarded.value = onRequestClose !== undefined;
  }, [onRequestClose, guarded]);

  const pan = Gesture.Pan()
    .activeOffsetY(10)
    // Downward only: dragging up is not a dismissal.
    .failOffsetY(-10)
    .onUpdate((event) => {
      drag.value = Math.max(0, event.translationY);
    })
    .onEnd((event) => {
      if (event.translationY > DISMISS_DISTANCE || event.velocityY > DISMISS_VELOCITY) {
        /*
          GUARDED, THE WINDOW GOES BACK FIRST AND ASKS AFTER.

          Not "close, then undo if refused": there is nothing to undo once the
          panel has folded, and a window that leaves and comes back is a worse
          answer than one that never left. Refusing therefore costs nothing at
          all — the panel is exactly where the finger found it, with everything
          still in it, which is what was asked for.
        */
        if (guarded.value) {
          drag.value = withTiming(0, RISE);
          runOnJS(requestClose)();
          return;
        }

        // The drag is handed over to the closing animation rather than reset,
        // so the window carries on downward from where the finger left it
        // instead of snapping back up first.
        progress.value = 1 - drag.value / travel;
        drag.value = 0;
        runOnJS(close)();
        return;
      }
      drag.value = withTiming(0, RISE);
    });

  // Darkens where it is. The panel travels; this never does.
  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value * 0.28 }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: (1 - progress.value) * travel + drag.value }],
  }));

  return (
    <DismissContext.Provider value={close}>
      <RequestCloseContext.Provider value={requestClose}>
      <HeadingContext.Provider value={setHeading}>
      <View style={{ width, height }}>
        {/* Tapping what is still visible closes, as tapping outside should. */}
        <Pressable style={styles.fill} onPress={close} accessibilityLabel="Fermer">
          <Animated.View style={[styles.fill, styles.backdrop, backdropStyle]} />
        </Pressable>

        <Animated.View
          style={[
            styles.panel,
            {
              top: insets.top,
              paddingBottom: insets.bottom,
              // The PAGE colour, not the card colour: what goes inside carries
              // its own cards, and cards painted surface on a surface panel
              // stop being visible. The backdrop, the corners and the lift are
              // what say this is floating — not its fill.
              backgroundColor: theme.colors.background,
              borderTopLeftRadius: theme.radius.xl,
              borderTopRightRadius: theme.radius.xl,
              ...theme.shadow,
              // It floats over the page rather than sitting on it, so it
              // carries its own lift even in the dark, where cards have none.
              shadowOpacity: theme.scheme === 'dark' ? 0.5 : 0.18,
              shadowRadius: 24,
            },
            panelStyle,
          ]}
        >
          <GestureDetector gesture={pan}>
            <View style={styles.actions}>
              {/* A spacer keeps the trailing action trailing when there is no
                  leading one, without a second layout branch. */}
              {left ?? <View />}

              {/*
                Between the two actions and sharing their line, so the name is
                read where the eye already is. Two lines, the second quieter:
                a brand qualifies a name, it does not stand beside it.
              */}
              {heading === null ? null : (
                <View style={styles.heading}>
                  <Text
                    style={[styles.title, { color: theme.colors.text }]}
                    numberOfLines={1}
                  >
                    {heading.title}
                  </Text>
                  {heading.subtitle === null || heading.subtitle === '' ? null : (
                    <Text
                      style={[styles.subtitle, { color: theme.colors.textMuted }]}
                      numberOfLines={1}
                    >
                      {heading.subtitle}
                    </Text>
                  )}
                </View>
              )}

              {right ?? <View />}
            </View>
          </GestureDetector>

          <View style={styles.body}>{children}</View>
        </Animated.View>
      </View>
      </HeadingContext.Provider>
      </RequestCloseContext.Provider>
    </DismissContext.Provider>
  );
}

const styles = StyleSheet.create({
  fill: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  backdrop: { backgroundColor: '#000000' },
  panel: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingTop: 10,
  },
  // It takes what the two actions leave, and no more: a long name must push
  // neither of them off, since one of them is the way out. Centred in what is
  // left rather than in the panel -- truly centring it would mean taking it
  // out of the row and laying it over the actions, which is a title that can
  // sit on top of a button.
  heading: { flex: 1, gap: 1, paddingHorizontal: 12, alignItems: 'center' },
  title: { fontSize: 16, fontWeight: '600', textAlign: 'center' },
  subtitle: { fontSize: 12, textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    // The content needs air under the actions: side by side they read as one
    // block, and what follows starts being mistaken for part of it.
    marginBottom: 18,
  },
  body: { flex: 1 },
});
