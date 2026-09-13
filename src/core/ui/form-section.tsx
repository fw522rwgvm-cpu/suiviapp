import { SymbolView } from 'expo-symbols';
import {
  Children,
  createContext,
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
  InputAccessoryView,
  Keyboard,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from 'react-native';
import { useTheme } from '@/core/theme';
import { ListSeparator } from './list-separator';

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
}

/** Absent outside a FormNavigation, where fields simply get no accessory. */
const FormNavContext = createContext<FormNav | null>(null);

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
 */
export function FormNavigation({ children }: { children: ReactNode }) {
  // State, not a ref: a field's position decides what its own bar may do, and
  // that has to be known while rendering, not only while handling a tap.
  const [fields, setFields] = useState<readonly RefObject<TextInput | null>[]>([]);

  const register = useRef((entry: RefObject<TextInput | null>) => {
    setFields((current) => [...current, entry]);
    return () => setFields((current) => current.filter((other) => other !== entry));
  });

  return (
    <FormNavContext.Provider value={{ fields, register: register.current }}>
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
  children,
}: {
  label?: string;
  /**
   * Drops the row's side padding, for a control that needs every point of the
   * card -- a wheel whose words are cut rather than shrunk, say. Its own
   * insets then stand in for the row's.
   */
  flush?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={[styles.row, flush === true ? styles.flush : null]}>
      {label === undefined ? null : (
        <Text style={[styles.label, { color: theme.colors.text }]} numberOfLines={1}>
          {label}
        </Text>
      )}
      <View style={label === undefined ? styles.wide : styles.value}>{children}</View>
    </View>
  );
}

/**
 * The field inside a row: bare, right-aligned, and drawing nothing.
 *
 * Takes everything TextInput takes, so a caller still chooses its keyboard and
 * its placeholder; it only fixes what must not vary from row to row, and hangs
 * this field's own accessory bar under it.
 */
export function FormInput({ style, ref, ...props }: TextInputProps & { ref?: Ref<TextInput> }) {
  const theme = useTheme();
  const navigation = useContext(FormNavContext);
  const own = useRef<TextInput | null>(null);

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
          // The caller's ref is served as well as ours: the quantity screen
          // needs one to focus and select the pre-filled value (specs 8.4).
          if (typeof ref === 'function') ref(instance);
          else if (ref !== null && ref !== undefined) ref.current = instance;
        }}
        inputAccessoryViewID={navigation === null ? undefined : accessoryId}
        placeholderTextColor={theme.colors.textFaint}
        {...props}
        style={[styles.input, { color: theme.colors.text }, style]}
      />

      {/*
        AFTER the field, deliberately. The native view binds itself on entering
        the window by looking for a text input carrying its id, so the field
        has to be in the window already -- which means mounted first.
      */}
      {navigation === null || position < 0 ? null : (
        <InputAccessoryView nativeID={accessoryId}>
          <View
            style={[
              styles.bar,
              { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
            ]}
          >
            <Arrow
              symbol="chevron.up"
              label="Champ précédent"
              disabled={position === 0}
              onPress={() => move(-1)}
            />
            <Arrow
              symbol="chevron.down"
              label="Champ suivant"
              disabled={position === navigation.fields.length - 1}
              onPress={() => move(1)}
            />

            <View style={styles.spacer} />

            <Pressable
              onPress={() => Keyboard.dismiss()}
              hitSlop={10}
              accessibilityRole="button"
              accessibilityLabel="Fermer le clavier"
            >
              <Text style={[styles.done, { color: theme.colors.accent }]}>OK</Text>
            </Pressable>
          </View>
        </InputAccessoryView>
      )}
    </>
  );
}

function Arrow({
  symbol,
  label,
  disabled,
  onPress,
}: {
  symbol: 'chevron.up' | 'chevron.down';
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={10}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={styles.arrow}
    >
      <SymbolView
        name={symbol}
        size={18}
        tintColor={disabled ? theme.colors.textFaint : theme.colors.accent}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 16,
    // An explicit height: the accessory is laid out absolutely and takes its
    // size from what is inside it, so something has to say how tall it is.
    height: 44,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  arrow: { paddingVertical: 4 },
  spacer: { flex: 1 },
  done: { fontSize: 17, fontWeight: '600' },
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
