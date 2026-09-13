import { SymbolView } from 'expo-symbols';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';
import { useTheme } from '@/core/theme';

/**
 * The search field of the library and of the add screen.
 *
 * Filters as you type, with no request and no debounce: specs 8.4b asks for
 * personal results "instantly, on every keystroke", and the whole food list is
 * already in one cached query, so a keystroke costs an array filter (D16).
 *
 * THE REMOTE HALF NEVER SHARES THAT RHYTHM, and slice 4 resolved it with a
 * submit rather than the debounce this comment used to anticipate. Open Food
 * Facts prohibits search-as-you-type outright and allows ten searches a minute
 * per IP address; a debounce would be a way of searching as you type slowly,
 * which meets the limit without meeting the prohibition. So the field reports
 * a submit, and remote results appear below the personal ones.
 */
export function SearchField({
  value,
  onChange,
  onSubmit,
  placeholder = 'Rechercher un aliment',
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
  /**
   * The explicit trigger of specs 8.4b, when the caller has a remote search to
   * fire. Omitted in the library, which has nothing remote to ask.
   *
   * The keyboard's own search key carries it, so the gesture costs no control
   * on screen — and it is a submit rather than a timer, because what Open Food
   * Facts prohibits is searching as you type, not searching often.
   */
  onSubmit?: () => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.field,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <SymbolView name="magnifyingglass" size={16} tintColor={theme.colors.textFaint} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder={placeholder}
        placeholderTextColor={theme.colors.textFaint}
        autoFocus={autoFocus}
        autoCorrect={false}
        autoCapitalize="none"
        returnKeyType="search"
        onSubmitEditing={onSubmit}
        // The keyboard stays up: the results appear underneath, and a second
        // term is the likeliest next action.
        blurOnSubmit={false}
        clearButtonMode="never"
        style={[styles.input, { color: theme.colors.text }]}
      />
      {value === '' ? null : (
        <Pressable
          onPress={() => onChange('')}
          hitSlop={12}
          accessibilityRole="button"
          accessibilityLabel="Effacer la recherche"
        >
          <SymbolView
            name="xmark.circle.fill"
            size={16}
            tintColor={theme.colors.textFaint}
          />
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  input: { flex: 1, fontSize: 17, padding: 0 },
});
