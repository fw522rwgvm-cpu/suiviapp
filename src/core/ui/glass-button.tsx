import { GlassView, isLiquidGlassAvailable } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useTheme } from '@/core/theme';

/**
 * A button with the Liquid Glass treatment, for controls drawn in JavaScript.
 *
 * ## Why this needs a native view at all
 *
 * The iOS 26 direction records that Liquid Glass is something UIKit applies to
 * ITS OWN controls: a view drawn in JavaScript cannot receive it, however it is
 * styled. That is why the native header's back button and its "+" look the way
 * they do for free, and why a Pressable next to them does not.
 *
 * GlassView is the exception, and the reason expo-glass-effect is in section 5:
 * it is a real UIVisualEffectView with children, so what goes inside it is
 * genuinely behind the same material rather than imitating it. Imitating it was
 * the alternative — a translucent fill and a hairline — and it looks close
 * until the wallpaper moves behind it.
 *
 * ## The two rules it has to keep
 *
 * NO BACKGROUND COLOUR on the glass. Opacity is exactly what cancels the
 * effect, which is the standing rule for every glass surface in this project.
 * The fallback below does paint, and that is correct: it is not glass.
 *
 * ASK BEFORE ASSUMING. Specs 2 sets iOS 18 as the minimum while the effect
 * needs 26, so isLiquidGlassAvailable() decides, exactly as the tab bar and the
 * transparent headers already do. Without it the button would be an invisible
 * rectangle on an older phone.
 *
 * Lives in core/ui with three real users on the day it is written — the two
 * actions of the calendar window and the favourite of the library list.
 */
export function GlassButton({
  label,
  symbol,
  onPress,
  accessibilityLabel,
  selected,
  tintColor,
}: {
  label?: string;
  symbol?: SFSymbol;
  onPress: () => void;
  accessibilityLabel?: string;
  /** For a button that carries a state, such as a favourite. */
  selected?: boolean;
  /** Overrides the accent, for a symbol whose colour carries meaning. */
  tintColor?: string;
}) {
  const theme = useTheme();
  const glass = isLiquidGlassAvailable();
  const color = tintColor ?? theme.colors.accent;

  // A symbol on its own gets equal padding, so it comes out round rather than
  // as a short pill.
  const shape = label === undefined ? styles.round : styles.pill;

  const content = (
    <>
      {symbol === undefined ? null : (
        <SymbolView name={symbol} size={18} tintColor={color} weight="semibold" />
      )}
      {label === undefined ? null : (
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={selected === undefined ? undefined : { selected }}
      hitSlop={8}
    >
      {({ pressed }) =>
        glass ? (
          <GlassView
            style={shape}
            glassEffectStyle="regular"
            // Lets the material itself answer the touch, the way a native
            // control does. The Pressable still owns the action.
            isInteractive
          >
            {content}
          </GlassView>
        ) : (
          <View
            style={[
              shape,
              styles.fallback,
              {
                backgroundColor: pressed ? theme.colors.border : theme.colors.surface,
                borderColor: theme.colors.border,
              },
            ]}
          >
            {content}
          </View>
        )
      }
    </Pressable>
  );
}

const base = {
  flexDirection: 'row',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 6,
  borderRadius: 999,
  overflow: 'hidden',
} as const;

const styles = StyleSheet.create({
  pill: { ...base, paddingHorizontal: 16, paddingVertical: 9 },
  round: { ...base, width: 38, height: 38 },
  fallback: { borderWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 16, fontWeight: '500' },
});
