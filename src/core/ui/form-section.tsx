import { Children, type ReactNode, type Ref } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
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

  return (
    <TextInput
      ref={ref}
      placeholderTextColor={theme.colors.textFaint}
      {...props}
      style={[styles.input, { color: theme.colors.text }, style]}
    />
  );
}

const styles = StyleSheet.create({
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
