import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';

/**
 * A circular progress ring, drawn with plain views.
 *
 * ## WHY NOT react-native-svg, WHICH IS THE DEPENDENCY FOR THIS
 *
 * Section 5 lists it and D13 makes it the project's ONE graphics tool, so
 * using it here would be no breach at all — the note this replaces in
 * remaining-banner.tsx said as much, and said a ring made of rotated views
 * would be "a second graphics tool".
 *
 * What changed is the cost, and it is not a matter of taste. react-native-svg
 * is NATIVE. Adding it puts a module in the bundle that the installed
 * development binary does not carry, and the first screen to mount this is the
 * JOURNAL — the application's home screen. So the whole application would stop
 * opening until a GitHub Actions cycle and a reinstall, and every other change
 * shipped beside it would become untestable at the same moment. That is the
 * exact failure mode `@react-native-picker/picker` and `expo-camera` already
 * charged this project for, both times on a screen you could at least avoid.
 *
 * So: views today, on the binary that is already on the phone. Slice 7 brings
 * react-native-svg for the charts and the body map, and this component is then
 * rewritten behind the same props without a single caller changing. It is
 * roughly fifty lines and it is genuinely reversible, which is what makes the
 * trade worth taking rather than merely convenient.
 *
 * ## HOW IT IS DRAWN, since the geometry is not obvious
 *
 * A view with borderRadius at half its size renders as a circle, and each
 * border side owns a 90° arc of it. Colouring TOP and RIGHT therefore paints a
 * 180° arc running from 10:30 clockwise to 4:30 — that is, starting 45° before
 * twelve o'clock.
 *
 * Rotating that half-ring by +45° puts its start exactly at twelve. From there
 * the arc is advanced by rotating further, and each half of the circle is
 * clipped by its own mask so that only the part that has been "filled" shows:
 *
 *  - the right mask shows the first 180°, with the half-ring at `angle - 135`;
 *  - the left mask shows the rest, with the half-ring at `angle2 + 45`.
 *
 * Both degenerate correctly: at zero the arc sits entirely in the half that is
 * clipped away, so nothing is painted.
 *
 * No rounded cap on the arc, which SVG would give for free. At these sizes it
 * is not visible, and it is the one thing this gives up.
 */
export function ProgressRing({
  /** 0 to 1. Clamp before you get here — domain/macros.ts does it. */
  progress,
  size,
  thickness,
  color,
  /** The unfilled part. Defaults to the theme's border. */
  trackColor,
  children,
}: {
  progress: number;
  size: number;
  thickness: number;
  color: string;
  trackColor?: string;
  /** Centred inside the ring — a figure, usually. */
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const track = trackColor ?? theme.colors.border;

  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const angle = clamped * 360;
  const firstHalf = Math.min(angle, 180);
  const secondHalf = Math.max(angle - 180, 0);

  const circle = {
    position: 'absolute' as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: thickness,
  };

  return (
    <View
      style={{ width: size, height: size }}
      // One element to assistive technology, not five: the arcs are a drawing
      // of a figure that is always written out beside them.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[circle, { left: 0, top: 0, borderColor: track }]} />

      {/* First 180°, clipped to the right half. */}
      <View style={[styles.mask, { left: size / 2, width: size / 2, height: size }]}>
        <View
          style={[
            circle,
            {
              left: -size / 2,
              top: 0,
              borderColor: 'transparent',
              borderTopColor: color,
              borderRightColor: color,
              transform: [{ rotate: `${firstHalf - 135}deg` }],
            },
          ]}
        />
      </View>

      {/* The rest, clipped to the left half. */}
      <View style={[styles.mask, { left: 0, width: size / 2, height: size }]}>
        <View
          style={[
            circle,
            {
              left: 0,
              top: 0,
              borderColor: 'transparent',
              borderTopColor: color,
              borderRightColor: color,
              transform: [{ rotate: `${secondHalf + 45}deg` }],
            },
          ]}
        />
      </View>

      {children === undefined ? null : <View style={styles.centre}>{children}</View>}
    </View>
  );
}

const styles = StyleSheet.create({
  mask: { position: 'absolute', top: 0, overflow: 'hidden' },
  centre: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
