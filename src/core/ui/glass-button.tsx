import {
  GlassView,
  isGlassEffectAPIAvailable,
  isLiquidGlassAvailable,
} from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { CrossFade } from './cross-fade';

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
 * ASK BEFORE ASSUMING, AND ASK TWICE. Specs 2 sets iOS 18 as the minimum while
 * the effect needs 26, so isLiquidGlassAvailable() decides — exactly as the tab
 * bar and the transparent headers already do. Without it the button would be an
 * invisible rectangle on an older phone.
 *
 * The second question is isGlassEffectAPIAvailable(), and it is not belt and
 * braces: expo-glass-effect added it because some iOS 26 BETAS ship without the
 * API and CRASH when a glass view is created. A version check alone would hand
 * those devices a crash on the first library screen.
 *
 * Exported so every other glass surface asks the same pair rather than
 * inventing its own guard.
 *
 * Lives in core/ui with four real users on the day it is written — the two
 * actions of the calendar window, the favourite of the library list, and the
 * calendar window itself.
 */

/**
 * How close two glass controls have to be before a GlassContainer blends them.
 *
 * iOS 26 composes a bar as a `UIGlassContainerEffect` holding one
 * `UIGlassEffect` per control, and what the container adds is that neighbours
 * AFFECT ONE ANOTHER — they merge as they approach and part as they separate.
 * That blending is the signature of an iOS 26 bar; capsules without it look
 * stuck on.
 *
 * Wide enough that a pair sitting side by side reads as one control in two
 * halves, narrow enough that a control at the other end of the bar stays its
 * own thing. Chosen, not measured — nothing here can be looked at.
 *
 * Here rather than in one of the two bars that use it: it is a property of the
 * material, and both accessory bars have to agree on it.
 */
export const MERGE_DISTANCE = 20;

/** True when the material can actually be used on this device, right now. */
export function canUseGlass(): boolean {
  return isLiquidGlassAvailable() && isGlassEffectAPIAvailable();
}
export function GlassButton({
  label,
  symbol,
  onPress,
  accessibilityLabel,
  selected,
  disabled,
  tintColor,
  fadeKey,
}: {
  label?: string;
  symbol?: SFSymbol;
  onPress: () => void;
  accessibilityLabel?: string;
  /** For a button that carries a state, such as a favourite. */
  selected?: boolean;
  /**
   * For a control that exists at both ends of what it walks — the keyboard
   * chevrons at the first and last field of a form.
   *
   * It stays DRAWN rather than disappearing: a bar whose contents come and go
   * as the focus moves is a bar that jumps, and the shape of the row is what
   * says where the chevrons are before they are read.
   */
  disabled?: boolean;
  /** Overrides the accent, for a symbol whose colour carries meaning. */
  tintColor?: string;
  /**
   * For ONE button that carries two meanings in turn: a name for what it means
   * now, so that a change of meaning fades instead of swapping between frames.
   *
   * It is the meaning, not the wording. A count going from 2 to 3 keeps the
   * same key -- fading there would blink the header on every line added.
   *
   * The button itself is never remounted and never faded: the glass would not
   * fade with it (see CrossFade). Only what is inside crosses.
   */
  fadeKey?: string;
}) {
  const theme = useTheme();
  const glass = canUseGlass();
  const color =
    disabled === true ? theme.colors.textFaint : (tintColor ?? theme.colors.accent);

  // A symbol on its own gets equal padding, so it comes out round rather than
  // as a short pill.
  //
  // A button holding TWO meanings gets neither: it takes one fixed size that
  // both fit in. Letting it size itself would have it jump from round to pill
  // in a single frame, underneath contents that are taking a fifth of a second
  // to cross -- and a container that snaps is what the eye reads, not the
  // fade inside it.
  const shape =
    fadeKey !== undefined ? styles.dual : label === undefined ? styles.round : styles.pill;

  // Its own row, rather than laid out by the shape around it: with a fade the
  // shape holds a single child, and the symbol and label have to keep their
  // spacing from something.
  const inside = (
    <View style={styles.inside}>
      {symbol === undefined ? null : (
        <SymbolView name={symbol} size={18} tintColor={color} weight="semibold" />
      )}
      {label === undefined ? null : (
        <Text style={[styles.label, { color }]} numberOfLines={1}>
          {label}
        </Text>
      )}
    </View>
  );

  const content = fadeKey === undefined ? inside : <CrossFade id={fadeKey}>{inside}</CrossFade>;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={
        selected === undefined && disabled === undefined ? undefined : { selected, disabled }
      }
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
  inside: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  pill: { ...base, paddingHorizontal: 16, paddingVertical: 9 },
  round: { ...base, width: 38, height: 38 },
  // Wide enough for the roomiest thing either meaning can hold -- a symbol
  // with two digits beside it -- at the round button's height.
  dual: { ...base, width: 56, height: 38 },
  fallback: { borderWidth: StyleSheet.hairlineWidth },
  label: { fontSize: 16, fontWeight: '500' },
});
