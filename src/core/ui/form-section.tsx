import {
  Children,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type Ref,
  type RefObject,
} from 'react';
import {
  Dimensions,
  InputAccessoryView,
  Keyboard,
  Pressable,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type TextInputProps,
} from 'react-native';
import { Text } from '@/core/ui/text';
import { fontFamilyFor, useTheme } from '@/core/theme';
import { canUseGlass, GlassButton } from './glass-button';
import { ListSeparator } from './list-separator';
import { shiftToReveal } from './reveal';

/**
 * A group of form rows, in the idiom of the Settings app.
 *
 * ## WHAT IS NATIVE HERE, AND WHAT IS NOT
 *
 * `TextInput` IS the native control -- a UITextField, with the keyboard,
 * selection, dictation and text interactions that come with it. The accessory
 * bar above the keyboard is native too: iOS docks it, moves it and takes it
 * away with the keyboard.
 *
 * The GROUP is not. React Native binds nothing to UITableView, and a grouped
 * inset form is a table view with a style; there is no component, in the
 * framework or in the libraries section 5 allows, that IS one. So this
 * reproduces the idiom with plain views, as the swipe gestures reproduce
 * theirs. Said plainly rather than left to be assumed.
 *
 * ## Why the field has no box of its own
 *
 * Because the ROW is the field. In Settings a text field is a label on one
 * side and the value on the other, with nothing drawn around either -- the row
 * and the line under it do all the work. A box inside a row is a second
 * container saying the same thing twice, and it is what made this application
 * look like a web form rather than an iOS one.
 *
 * The consequence is that the value is right-aligned, always. That is not
 * decoration: it is what lets a column of rows be read down the right-hand
 * edge, which is the whole reason the idiom exists.
 */

interface FormNav {
  /** Every field that has signed in, in the order they were mounted. */
  fields: readonly RefObject<TextInput | null>[];
  register(entry: RefObject<TextInput | null>): () => void;
  /** Absent when the caller gave no scroll view to move. */
  anchor?: FormScrollAnchor;
}

/**
 * What a form needs from the scroll view it sits in, to keep the field being
 * typed into where it can be seen.
 *
 * Handed in by the caller rather than found: a provider cannot reach the scroll
 * view its own caller renders, and a context read by the component that
 * provides it does not exist.
 */
export interface FormScrollAnchor {
  /** Called when a field takes focus, and again when the keyboard arrives. */
  onFieldFocus(field: TextInput | null): void;
  onFieldBlur(field: TextInput | null): void;
}

/** Absent outside a FormNavigation, where fields simply get no accessory. */
const FormNavContext = createContext<FormNav | null>(null);

/**
 * How a row reaches the field inside it.
 *
 * The row is the field (see the note at the top), so pressing anywhere on it
 * should put the cursor in it — and until now only the field's own box did,
 * which on a labelled row is everything except the words on the left. A context
 * rather than a prop because the field can be nested anywhere inside the row:
 * beside a unit, inside a pair, at the end of a line of figures.
 */
const FormRowContext = createContext<RefObject<TextInput | null> | null>(null);

/**
 * The scroll view's half of the bargain: keep the focused field visible.
 *
 * ## WHY THIS IS NOT LEFT TO THE SYSTEM
 *
 * iOS reveals the first responder when the keyboard ARRIVES, which covers
 * tapping into a form and nothing else. Walking the form with the chevrons
 * moves the responder while the keyboard is already up — no notification, no
 * inset change, nothing to react to — so the field two rows down is focused
 * behind the keyboard, and the person types into something they cannot see.
 * That is what this exists for.
 *
 * ## EVERYTHING HERE IS A REF, AND THAT IS THE POINT
 *
 * None of it says anything about what is rendered. The offset in state would
 * re-render the form on every frame of a scroll to change nothing at all.
 *
 * ## IT IS IDEMPOTENT ON PURPOSE
 *
 * A field already inside the band moves nothing, so this can run on focus AND
 * when the keyboard appears without the two fighting — the second one is what
 * catches the first tap into a form, where the keyboard's height is not yet
 * known when the field takes focus.
 */
export function useFormScroll(): {
  anchor: FormScrollAnchor;
  scrollProps: {
    ref: RefObject<ScrollView | null>;
    onScroll: (event: NativeSyntheticEvent<NativeScrollEvent>) => void;
    onLayout: (event: { nativeEvent: { layout: { height: number } } }) => void;
    scrollEventThrottle: number;
  };
} {
  const ref = useRef<ScrollView>(null);
  const offset = useRef(0);
  const viewport = useRef(0);
  const focused = useRef<TextInput | null>(null);
  // Where the keyboard's top edge is, in screen coordinates. The window's own
  // height until one shows, which is the honest answer to "nothing covers it".
  const keyboardTop = useRef(Dimensions.get('window').height);

  const reveal = useCallback((field: TextInput | null) => {
    const scroll = ref.current;
    if (field === null || scroll === null) return;

    /*
      measureInWindow rather than measureLayout: it needs no ancestor to be
      relative to, so the form does not have to hand a node down through
      everything between the scroll view and the row.
    */
    field.measureInWindow((_x, y, _width, height) => {
      const wanted = shiftToReveal(y, height, {
        keyboardTop: keyboardTop.current,
        viewportHeight: viewport.current,
        windowHeight: Dimensions.get('window').height,
      });
      if (wanted === 0) return;
      scroll.scrollTo({ y: Math.max(0, offset.current + wanted), animated: true });
    });
  }, []);

  useEffect(() => {
    const shown = Keyboard.addListener('keyboardDidShow', (event) => {
      keyboardTop.current = event.endCoordinates.screenY;
      reveal(focused.current);
    });
    const hidden = Keyboard.addListener('keyboardWillHide', () => {
      keyboardTop.current = Dimensions.get('window').height;
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [reveal]);

  const anchor = useRef<FormScrollAnchor>({
    onFieldFocus: (field) => {
      focused.current = field;
      reveal(field);
    },
    onFieldBlur: (field) => {
      if (focused.current === field) focused.current = null;
    },
  });

  return {
    anchor: anchor.current,
    scrollProps: {
      ref,
      onScroll: (event) => {
        offset.current = event.nativeEvent.contentOffset.y;
      },
      onLayout: (event) => {
        viewport.current = event.nativeEvent.layout.height;
      },
      // Sixty a second: the offset has to be current at the instant a chevron
      // is pressed, and a coarser rate would scroll from a stale place.
      scrollEventThrottle: 16,
    },
  };
}

/**
 * Chevrons above the keyboard, to walk a form without reaching for it.
 *
 * ## Why a form needs them at all
 *
 * Every figure in these forms is typed on a decimal pad, and a decimal pad has
 * no return key -- nothing on it can move to the next field or put it away.
 * Without an accessory, a four-row form means four taps outside the keyboard
 * and four taps back in.
 *
 * ## ONE BAR PER FIELD, WHICH IS NOT WHAT THE DOCUMENTATION SUGGESTS
 *
 * An InputAccessoryView is presented as something several inputs share through
 * a nativeID. They cannot, and the reason is in React Native's own source:
 * RCTInputAccessoryComponentView, on entering the window, looks for THE FIRST
 * text input carrying that id and gives the bar to that one. One view, one
 * field. A bar shared by four fields therefore appears above exactly one of
 * them -- which is what happened, and why this is written the way it is.
 *
 * So each field owns its own accessory, with its own id, and they all draw the
 * same bar. What differs is what the chevrons may do, which depends on where
 * that field stands in the form.
 *
 * ## How it knows what "next" is
 *
 * Fields sign in as they mount, and React mounts them in the order they are
 * written, so the order in the source is the order on screen -- which is the
 * order a form is filled in. Nothing has to number them, and a row added later
 * takes its place by being written in its place.
 *
 * ## AND THE CHEVRONS NOW MOVE THE PAGE AS WELL AS THE FOCUS
 *
 * They always moved the focus and never the page, so walking down a form put
 * the cursor in a field behind the keyboard. `anchor` is what fixes that, and
 * it is optional: a form that does not scroll gives none and nothing changes.
 */
export function FormNavigation({
  anchor,
  children,
}: {
  /** From useFormScroll, when the form scrolls. Omitted when it does not. */
  anchor?: FormScrollAnchor;
  children: ReactNode;
}) {
  // State, not a ref: a field's position decides what its own bar may do, and
  // that has to be known while rendering, not only while handling a tap.
  const [fields, setFields] = useState<readonly RefObject<TextInput | null>[]>([]);

  const register = useRef((entry: RefObject<TextInput | null>) => {
    setFields((current) => [...current, entry]);
    return () => setFields((current) => current.filter((other) => other !== entry));
  });

  return (
    <FormNavContext.Provider value={{ fields, register: register.current, anchor }}>
      {children}
    </FormNavContext.Provider>
  );
}

export function FormSection({
  caption,
  children,
}: {
  /** The quiet line above the group. Settings uses one to name each. */
  caption?: string;
  children: ReactNode;
}) {
  const theme = useTheme();

  // Nulls are how a caller says "this row does not apply"; they must not each
  // leave a separator behind.
  const rows = Children.toArray(children).filter((row) => row !== null);

  return (
    <View style={styles.group}>
      {caption === undefined ? null : (
        <Text style={[styles.caption, { color: theme.colors.textFaint }]}>
          {caption.toUpperCase()}
        </Text>
      )}

      <View
        style={[
          styles.card,
          {
            backgroundColor: theme.colors.surface,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.lg,
          },
        ]}
      >
        {rows.map((row, index) => (
          // The index is the identity: these are positions in a form, written
          // out one by one in the source, and they neither move nor sort.
          <View key={index}>
            {index === 0 ? null : <ListSeparator />}
            {row}
          </View>
        ))}
      </View>
    </View>
  );
}

/**
 * One row: what is being asked on the left, the answer on the right.
 *
 * A row with no label gives its whole width to the content, which is what a
 * control spanning the row needs -- a segmented control, or a line of figures
 * that belong together.
 */
export function FormRow({
  label,
  flush,
  onPress,
  children,
}: {
  label?: string;
  /**
   * Drops the row's side padding, for a control that needs every point of the
   * card -- a wheel whose words are cut rather than shrunk, say. Its own
   * insets then stand in for the row's.
   */
  flush?: boolean;
  /**
   * What pressing the row does, when it is not simply "focus the field".
   *
   * For a row whose value BECOMES a field when touched — the quantity screen —
   * there is nothing to focus yet, and the press is what creates it.
   */
  onPress?: () => void;
  children: ReactNode;
}) {
  const theme = useTheme();
  const field = useRef<TextInput | null>(null);

  const inside = (
    <>
      {label === undefined ? null : (
        <Text style={[styles.label, { color: theme.colors.text }]} numberOfLines={1}>
          {label}
        </Text>
      )}
      <View style={label === undefined ? styles.wide : styles.value}>{children}</View>
    </>
  );

  /*
    A FLUSH ROW KEEPS ITS TOUCHES, as well as its width.

    `flush` already means "a control needs every point of this row" -- and the
    one that asks for it is the quantity wheel, a UIPickerView with gesture
    recognisers of its own. A JavaScript Pressable wrapped around a native
    control that scrolls is the one nesting this project has no reason to risk,
    on a control that is on the critical path and verified on the device. So the
    same marker decides both: a row that hands over its width hands over its
    touches.
  */
  if (flush === true) {
    return (
      <FormRowContext.Provider value={field}>
        <View style={[styles.row, styles.flush]}>{inside}</View>
      </FormRowContext.Provider>
    );
  }

  /*
    ALWAYS A PRESSABLE OTHERWISE, never one only when a field signed in. A field
    signs in from an effect, so the element type would change after the first
    render, and React would unmount the subtree and mount it again -- taking the
    field's own text with it. The cost of pressing a row that has no field is
    nothing happening, which is what pressing it did before.

    No role and no highlight: a row is not a button. A Pressable written inside
    one -- the "Ajouter" of the portion and ingredient editors -- still answers
    for itself, the deepest view being offered the touch first.
  */
  return (
    <FormRowContext.Provider value={field}>
      <Pressable
        onPress={() => {
          if (onPress !== undefined) onPress();
          else field.current?.focus();
        }}
        style={styles.row}
      >
        {inside}
      </Pressable>
    </FormRowContext.Provider>
  );
}

/**
 * The field inside a row: bare, right-aligned, and drawing nothing.
 *
 * Takes everything TextInput takes, so a caller still chooses its keyboard and
 * its placeholder; it only fixes what must not vary from row to row, and hangs
 * this field's own accessory bar under it.
 */
export function FormInput({
  style,
  ref,
  onFocus,
  onBlur,
  selectTextOnFocus,
  ...props
}: TextInputProps & { ref?: Ref<TextInput> }) {
  const theme = useTheme();
  const glass = canUseGlass();
  const navigation = useContext(FormNavContext);
  const row = useContext(FormRowContext);
  const own = useRef<TextInput | null>(null);

  /**
   * A FIGURE IS REPLACED, A WORD IS EDITED.
   *
   * Selecting on focus is right for a number — you are stating a new one, and
   * clearing four digits first is four taps on a backspace. It is wrong for a
   * name: touching "Développé couché" to fix its accent must not arm the whole
   * string for deletion. The keyboard says which of the two this is, so nothing
   * has to be declared row by row, and a caller can still say otherwise.
   */
  const numeric =
    props.keyboardType === 'decimal-pad' ||
    props.keyboardType === 'number-pad' ||
    props.keyboardType === 'numeric' ||
    props.keyboardType === 'numbers-and-punctuation';
  const selects = selectTextOnFocus ?? numeric;

  // Punctuation-free: this crosses to a native view as a plain string, and
  // useId spells its own with colons.
  const accessoryId = `field${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  useEffect(() => {
    // Signing in on mount is what fixes the order: React mounts these in the
    // order they are written, so the source order is the order on screen.
    if (navigation === null) return;
    return navigation.register(own);
    // Registering again on every render would put the same field in the list
    // many times over; the navigator's identity is not what decides this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const position = navigation === null ? -1 : navigation.fields.indexOf(own);

  function move(step: number): void {
    navigation?.fields[position + step]?.current?.focus();
  }

  return (
    <>
      <TextInput
        ref={(instance) => {
          own.current = instance;
          // The row keeps its own handle, so pressing the row's label reaches
          // the field. Set here rather than registered, because a row holds one
          // field and the last one written is the one it means.
          if (row !== null) row.current = instance;
          // The caller's ref is served as well as ours: the quantity screen
          // needs one to focus and select the pre-filled value (specs 8.4).
          if (typeof ref === 'function') ref(instance);
          else if (ref !== null && ref !== undefined) ref.current = instance;
        }}
        inputAccessoryViewID={navigation === null ? undefined : accessoryId}
        placeholderTextColor={theme.colors.textFaint}
        selectTextOnFocus={selects}
        onFocus={(event) => {
          navigation?.anchor?.onFieldFocus(own.current);
          /*
            THE SELECTION IS ASKED FOR TWICE, AND THAT IS NOT A BELT AND BRACES.

            selectTextOnFocus is applied by iOS as the field begins editing; a
            CONTROLLED value is then written into it afterwards, and writing
            text moves the caret to the end. Which of the two lands last is not
            ours to decide, so the selection is also stated on the next frame —
            the same requestAnimationFrame remedy slice 3 found for the quantity
            field. Selecting all twice selects all.
          */
          if (selects) {
            const length = typeof props.value === 'string' ? props.value.length : 0;
            if (length > 0) {
              requestAnimationFrame(() => own.current?.setSelection(0, length));
            }
          }
          onFocus?.(event);
        }}
        onBlur={(event) => {
          navigation?.anchor?.onFieldBlur(own.current);
          onBlur?.(event);
        }}
        {...props}
        style={[
          styles.input,
          // A TextInput is not a Text, so core/ui/text does not reach it: a
          // field left in the system face beside a label in Nunito is the one
          // place the swap would be visible as a mistake.
          { color: theme.colors.text, fontFamily: fontFamilyFor('normal', theme.fontsLoaded) },
          style,
        ]}
      />

      {/*
        AFTER the field, deliberately. The native view binds itself on entering
        the window by looking for a text input carrying its id, so the field
        has to be in the window already -- which means mounted first.
      */}
      {navigation === null || position < 0 ? null : (
        <InputAccessoryView nativeID={accessoryId}>
          {/*
            A ROW OF GLASS CONTROLS, NOT A PAINTED STRIP.

            It was a filled surface with a hairline on top, which is the pre-26
            shape of an accessory and which is what was reported: it does not
            look like Safari's. On iOS 26 the accessory is not a bar at all —
            it is controls floating over the page, each its own capsule, with
            the page showing through between them.

            NOT the "never glass in a native header" rule pointing the other
            way: a header already carries UIKit's material behind whatever it is
            given, and an InputAccessoryView is an empty container we fill.

            Where the material is unavailable the strip paints again exactly as
            before — GlassButton falls back on its own, and a transparent bar
            holding painted buttons would be neither one thing nor the other.
          */}
          <View
            style={[
              styles.bar,
              glass
                ? null
                : {
                    backgroundColor: theme.colors.surface,
                    borderTopColor: theme.colors.border,
                    borderTopWidth: StyleSheet.hairlineWidth,
                  },
            ]}
          >
            {/*
              The chevrons stay DRAWN at the ends of the form rather than
              disappearing: a bar whose contents come and go as the focus moves
              is a bar that jumps, and the shape of the row is what says where
              they are before they are read.
            */}
            <GlassButton
              symbol="chevron.up"
              accessibilityLabel="Champ précédent"
              disabled={position === 0}
              onPress={() => move(-1)}
            />
            <GlassButton
              symbol="chevron.down"
              accessibilityLabel="Champ suivant"
              disabled={position === navigation.fields.length - 1}
              onPress={() => move(1)}
            />

            <View style={styles.spacer} />

            <GlassButton
              label="OK"
              accessibilityLabel="Fermer le clavier"
              onPress={() => Keyboard.dismiss()}
            />
          </View>
        </InputAccessoryView>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    // Capsules sit close to each other and far from the OK: the two chevrons
    // are one control in two halves, which the spacing has to say.
    gap: 8,
    paddingHorizontal: 16,
    // The accessory is laid out absolutely and takes its size from what is
    // inside it, so something has to give it a height. The capsules do, plus
    // enough air that they float rather than sit against the keyboard.
    paddingVertical: 8,
  },
  spacer: { flex: 1 },
  group: { gap: 7 },
  // Uppercase and faint, the way a grouped table names its sections. Indented
  // to the card's own text, not to the screen.
  caption: { fontSize: 12, fontWeight: '600', letterSpacing: 0.6, marginLeft: 16 },
  card: { borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    // The system's own row height. Below it a row stops being comfortable to
    // hit; above it a form starts to look like a list of cards.
    minHeight: 44,
    paddingVertical: 7,
  },
  flush: { paddingHorizontal: 0 },
  label: { fontSize: 17 },
  // A row, not a column: a value is often a figure AND its unit, or a field
  // and the thing it is counted in, and those sit side by side.
  value: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 6,
  },
  wide: { flex: 1 },
  // No padding of its own: the row already places it, and a field that adds
  // its own leaves the column of values ragged.
  input: { flex: 1, fontSize: 17, textAlign: 'right', padding: 0 },
});
