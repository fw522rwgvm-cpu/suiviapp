import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';

/**
 * Explicit empty state for a tab not yet served by the current version
 * (specs 3.1 and 7).
 *
 * Lives in core/ui because it has four real users on the day it is written —
 * the four tabs — and not by anticipation (D10).
 *
 * "Explicit" is the operative word: a blank screen says the application is
 * broken, whereas naming what is coming says it is unfinished.
 */
export function EmptyState({
  symbol,
  title,
  message,
  note,
}: {
  symbol: SFSymbol;
  title: string;
  message: string;
  note?: string;
}) {
  const theme = useTheme();

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.container}
    >
      <View style={styles.content}>
        <SymbolView
          name={symbol}
          size={44}
          tintColor={theme.colors.textFaint}
          weight="regular"
        />
        <Text style={[styles.title, { color: theme.colors.text }]}>{title}</Text>
        <Text style={[styles.message, { color: theme.colors.textMuted }]}>{message}</Text>
        {note === undefined ? null : (
          <Text style={[styles.note, { color: theme.colors.textFaint }]}>{note}</Text>
        )}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 32, paddingVertical: 48 },
  content: { alignItems: 'center', gap: 12 },
  title: { fontSize: 20, fontWeight: '600', textAlign: 'center', marginTop: 4 },
  message: { fontSize: 16, lineHeight: 23, textAlign: 'center' },
  note: { fontSize: 13, lineHeight: 19, textAlign: 'center', marginTop: 4 },
});
