import { GlassView } from 'expo-glass-effect';
import { SymbolView, type SFSymbol } from 'expo-symbols';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';
import { canUseGlass } from './glass-button';

/**
 * The bar above the keyboard, as iOS 26 draws one.
 *
 * ## IT IS ONE CAPSULE, NOT A BAR
 *
 * Four shapes were tried before a screenshot settled it, and every one of them
 * was a guess at the same question:
 *
 *  - a painted surface with a hairline on top — the pre-26 accessory;
 *  - separate floating capsules, one per control;
 *  - a full-width slab of glass;
 *  - capsules inside a GlassContainer, close enough to merge.
 *
 * What iOS 26 actually puts there is a SINGLE capsule of glass, inset from both
 * edges, floating clear of the keyboard, with the page visible around it. The
 * controls sit inside it: the ones that walk the form at the leading edge, the
 * one that finishes at the trailing edge, and nothing but material between
 * them.
 *
 * That is why nothing in here is a GlassButton. A capsule inside a capsule is
 * glass inside glass — the mistake the iOS 26 direction names for headers, one
 * level down — so the controls are bare Pressables and the bar is the material.
 *
 * ## NO PAINTED BACKGROUND, EVER
 *
 * The standing rule for every glass surface in this project: opacity is exactly
 * what cancels the effect. Where the material is unavailable the bar paints a
 * surface and a rule instead, which is honest — it is not glass, and it should
 * not pretend to be.
 *
 * ## WHAT IS STILL A RECONSTRUCTION
 *
 * InputAccessoryView hands over an empty container, and iOS exposes no standard
 * accessory bar to ask for — not through React Native, and not through UIKit
 * outside a web view. The material is the system's; the shape, the glyphs and
 * the spacing are read off a screenshot and drawn here.
 */
export function KeyboardBar({ children }: { children: ReactNode }) {
  const theme = useTheme();

  if (canUseGlass()) {
    return (
      <View style={styles.tray}>
        <GlassView style={styles.capsule} glassEffectStyle="regular" isInteractive>
          {children}
        </GlassView>
      </View>
    );
  }

  return (
    <View
      style={[
        styles.fallback,
        { backgroundColor: theme.colors.surface, borderTopColor: theme.colors.border },
      ]}
    >
      {children}
    </View>
  );
}

/** A glyph on the bar: the chevrons that walk a form. */
export function BarGlyph({
  symbol,
  label,
  disabled,
  onPress,
}: {
  symbol: SFSymbol;
  label: string;
  disabled?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled === true }}
      style={styles.glyph}
    >
      {/*
        THE GLYPHS ARE IN THE TEXT COLOUR, not the accent.

        Read off the screenshot rather than chosen: on the system's own bar they
        are label-coloured, and the accent would make them look like links on a
        surface whose whole job is to be neutral. A control at the end of what it
        walks goes faint rather than away — a bar whose contents come and go as
        the focus moves is a bar that jumps.
      */}
      <SymbolView
        name={symbol}
        size={19}
        weight="semibold"
        tintColor={disabled === true ? theme.colors.textFaint : theme.colors.text}
      />
    </Pressable>
  );
}

/** The trailing control: a tick, which is what iOS 26 puts there. */
export function BarConfirm({ label, onPress }: { label: string; onPress: () => void }) {
  const theme = useTheme();

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={styles.glyph}
    >
      <SymbolView name="checkmark" size={19} weight="semibold" tintColor={theme.colors.text} />
    </Pressable>
  );
}

/** Pushes the confirmation to the trailing edge. */
export function BarSpacer() {
  return <View style={styles.spacer} />;
}

const HEIGHT = 44;

const styles = StyleSheet.create({
  /**
   * The capsule floats: inset from both edges and clear of the keyboard below.
   *
   * The accessory is laid out absolutely by iOS and sized to its content, so
   * the tray is what declares how tall the whole thing is.
   */
  tray: { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8 },
  capsule: {
    height: HEIGHT,
    // A pill: half its own height, which is what makes the ends read as caps
    // rather than as corners.
    borderRadius: HEIGHT / 2,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    // The material is the background. Painting one here would cancel it.
    overflow: 'hidden',
  },
  /** Not glass, and it does not pretend to be: a strip, as it always was. */
  fallback: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  glyph: { paddingVertical: 6, paddingHorizontal: 10 },
  spacer: { flex: 1 },
});
