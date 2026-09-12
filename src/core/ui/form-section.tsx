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
 * `TextInput` IS the native control -- it is a UITextField, and everything it
 * brings comes for free: the keyboard, selection, dictation, autocorrect, the
 * system's own text interactions.
 *
 * The GROUP is not. React Native binds nothing to UITableView, and a grouped
 * inset form is a table view with a style; there is no component, in the
 * framework or in the libraries section 5 allows, that IS one. So this
 * reproduces the idiom with plain views, as the swipe gestures reproduce
 * theirs: a rounded card, rows of a single height, a hairline between them,
 * and a quiet caption above. Said plainly rather than left to be assumed.
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

/**
 * Chevrons above the keyboard, to walk a form without reaching for it.
 *
 * ## THIS ONE IS ACTUALLY NATIVE
 *
 * `InputAccessoryView` is a real accessory view: iOS docks it to the top of
 * the keyboard, moves it with the keyboard, and takes it away with it. What is
 * drawn inside is ours -- two chevrons and a way out -- but the bar itself is
 * the system's, unlike the grouped rows below, which only look like theirs.
 *
 * ## Why a form needs it at all
 *
 * Every figure in these forms is typed on a decimal pad, and a decimal pad has
 * no return key -- nothing on it can move to the next field or put it away.
 * Without an accessory, a four-row form means four taps outside the keyboard
 * and four taps back in.
 *
 * ## How it knows what "next" is
 *
 * Fields sign in as they mount, and React mounts them in the order they are
 * written, so the order in the source is the order on screen -- which is the
 * order a form is filled in. Nothing has to number them, and a row added later
 * takes its place by being written in its place.
 *
 * A screen with no fields renders no bar: `count` stays at zero and the
 * accessory is never mounted.
 */
export function FormNavigation({ children }: { children: ReactNode }) {
  const theme = useTheme();
  // useId spells its ids with colons; this one crosses to a native view as a
  // plain string, and a punctuation-free one has nothing to be tripped over by.
  const id = `form${useId().replace(/[^a-zA-Z0-9]/g, '')}`;

  const fields = useRef<RefObject<TextInput | null>[]>([]);
  const [count, setCount] = useState(0);
  const [position, setPosition] = useState(-1);

  const navigation: FormNav = {
    id,
    register(entry) {
      fields.current = [...fields.current, entry];
      setCount(fields.current.length);
      return () => {
        fields.current = fields.current.filter((other) => other !== entry);
        setCount(fields.current.length);
      };
    },
    focused(entry) {
      setPosition(fields.current.indexOf(entry));
    },
  };

  function move(step: number): void {
    const next = fields.current[position + step];
    next?.current?.focus();
  }

  return (
    <FormNavContext.Provider value={navigation}>
      {children}

      {count === 0 ? null : (
        <InputAccessoryView nativeID={id}>
          <View
            style={[
              styles.bar,
              {
                backgroundColor: theme.colors.surface,
                borderTopColor: theme.colors.border,
              },
            ]}
          >
            <Arrow
              symbol="chevron.up"
              label="Champ précédent"
              disabled={position <= 0}
              onPress={() => move(-1)}
            />
            <Arrow
              symbol="chevron.down"
              label="Champ suivant"
              disabled={position < 0 || position >= count - 1}
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
    </FormNavContext.Provider>
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

interface FormNav {
  /** Ties every field to the one accessory view this form owns. */
  id: string;
  register(entry: RefObject<TextInput | null>): () => void;
  focused(entry: RefObject<TextInput | null>): void;
}

/** Absent outside a FormNavigation, where fields simply get no accessory. */
const FormNavContext = createContext<FormNav | null>(null);

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
  children,
}: {
  label?: string;
  children: ReactNode;
}) {
  const theme = useTheme();

  return (
    <View style={styles.row}>
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
 * its placeholder; it only fixes what must not vary from row to row.
 */
export function FormInput({
  style,
  ref,
  ...props
}: TextInputProps & {
  /**
   * Plain prop rather than forwardRef: React 19 passes one through on its own,
   * and the quantity screen needs it to focus and select the pre-filled value,
   * which is the whole of specs 8.4.
   */
  ref?: Ref<TextInput>;
}) {
  const theme = useTheme();
  const navigation = useContext(FormNavContext);
  const own = useRef<TextInput | null>(null);

  useEffect(() => {
    // Signing in on mount is what fixes the order: React mounts these in the
    // order they are written, so the source order is the order on screen.
    if (navigation === null) return;
    return navigation.register(own);
    // Registering again on every render would put the same field in the list
    // many times over; the navigator's identity is not what decides this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <TextInput
      ref={(instance) => {
        own.current = instance;
        // The caller's ref is served as well as ours: the quantity screen
        // needs one to focus and select the pre-filled value (specs 8.4).
        if (typeof ref === 'function') ref(instance);
        else if (ref !== null && ref !== undefined) ref.current = instance;
      }}
      inputAccessoryViewID={navigation?.id}
      onFocus={() => navigation?.focused(own)}
      placeholderTextColor={theme.colors.textFaint}
      {...props}
      style={[styles.input, { color: theme.colors.text }, style]}
    />
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
    paddingHorizontal: 16,
    paddingVertical: 8,
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
