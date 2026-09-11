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
 * The debounce that specs 8.4b DOES require arrives in slice 4, and only for
 * the remote half: Open Food Facts explicitly forbids search-as-you-type and
 * rate-limits to ten searches a minute. That is why remote results are fetched
 * on an explicit action and appear below these, rather than being folded into
 * the same field.
 */
export function SearchField({
  value,
  onChange,
  placeholder = 'Rechercher un aliment',
  autoFocus = false,
}: {
  value: string;
  onChange: (value: string) => void;
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
