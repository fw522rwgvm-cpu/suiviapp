import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text } from 'react-native';
import { useTheme } from '@/core/theme';

/**
 * A text button for a system header.
 *
 * Lives in core/ui because it has three real users on the day it is written —
 * the add modal, the quantity modal and the free-entry modal — and not by
 * anticipation (D10).
 *
 * WHY IT EXISTS AT ALL. A screen presented as a fullScreenModal is the root of
 * its own presentation: the native stack draws no back button for it, and iOS
 * offers no swipe-down the way it does for a page sheet. So a full-screen
 * modal with nothing in its headerLeft is a screen you cannot leave without
 * completing it — which slice 1 shipped for free entry and nobody noticed,
 * because that screen has a save and a delete and both close it.
 *
 * The chrome belongs to the system (iOS 26 direction): this is a label placed
 * in the native header, not a header painted in JavaScript.
 */
export function HeaderTextButton({
  label,
  onPress,
  symbol,
}: {
  label: string;
  onPress: () => void;
  /** Drawn before the label. A chevron reads as "back", nothing reads as "close". */
  symbol?: SFSymbol;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.button}
    >
      {symbol === undefined ? null : (
        <SymbolView name={symbol} size={17} tintColor={theme.colors.accent} weight="semibold" />
      )}
      <Text style={[styles.label, { color: theme.colors.accent }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  // Padding rather than margin, as on the Journal's header icons: it pulls the
  // label off the edge AND widens the target, where a margin would only move
  // it. Applied here rather than at each call site so the three modals that
  // use this cannot drift apart.
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  label: { fontSize: 17 },
});
