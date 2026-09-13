import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';

/**
 * A circular progress ring or an open gauge, drawn with plain views.
 *
 * ## WHY NOT react-native-svg, WHICH IS THE DEPENDENCY FOR THIS
 *
 * Section 5 lists it and D13 makes it the project's ONE graphics tool, so using
 * it here would be no breach at all. What decided against it is not taste: it
 * is NATIVE, and the first screen to mount this is the JOURNAL — the
 * application's home screen. Adding it puts a module in the bundle that the
 * installed development binary does not carry, so the application would stop
 * opening until a GitHub Actions cycle and a reinstall, taking every change
 * shipped beside it down with it.
 *
 * Slice 7 brings react-native-svg for the charts and the body map, and this is
 * then rewritten behind these same props without a single caller changing.
 *
 * ## HOW AN ARC IS DRAWN, since the geometry is not obvious
 *
 * A view with borderRadius at half its size renders as a circle, and each
 * border side owns a 90° arc of it. Colouring TOP and RIGHT paints a 180° arc
 * running from 10:30 clockwise to 4:30 — that is, starting 45° before twelve.
 *
 * Rotating that half-ring by +45° puts its start exactly at twelve. From there
 * the arc is advanced by rotating further, and each half of the circle is
 * clipped by its own mask so only the filled part shows:
 *
 *  - the right mask shows the first 180°, with the half-ring at `angle - 135`;
 *  - the left mask shows the rest, with the half-ring at `angle2 + 45`.
 *
 * Both degenerate correctly: at zero the arc sits entirely in the half that is
 * clipped away, so nothing is painted.
 *
 * ## THE ROUNDED ENDS ARE DOTS, AND THEY ARE EXACT
 *
 * SVG would give them as strokeLinecap="round". Here each end is a circle whose
 * DIAMETER IS THE STROKE THICKNESS, centred on the arc's centre line — which is
 * geometrically the same shape a round cap is, not an approximation of it. Two
 * per arc, placed by the trigonometry of the angle they terminate.
 *
 * They are skipped where they would be wrong rather than merely redundant: an
 * empty arc has no ends to round, and a closed circle has no ends at all.
 *
 * ## AN OPEN GAUGE IS THE SAME ARC, ROTATED
 *
 * `sweep` shortens it and `startAngle` turns the whole frame, so a three-quarter
 * gauge is sweep 270 starting at 225° — a 90° gap centred on six o'clock. The
 * children stay OUTSIDE that rotation, or the figure inside the gauge would
 * hang at an angle.
 */
export function ProgressRing({
  /** 0 to 1. Clamp before you get here — domain/macros.ts does it. */
  progress,
  size,
  thickness,
  color,
  /** The unfilled part. Defaults to the theme's border. */
  trackColor,
  /** Degrees of arc the full gauge covers. 360 is a closed ring. */
  sweep = FULL_TURN,
  /** Where the arc begins, clockwise from twelve o'clock. */
  startAngle = 0,
  children,
}: {
  progress: number;
  size: number;
  thickness: number;
  color: string;
  trackColor?: string;
  sweep?: number;
  startAngle?: number;
  /** Centred inside the ring — a figure, usually. Never rotated with it. */
  children?: React.ReactNode;
}) {
  const theme = useTheme();
  const track = trackColor ?? theme.colors.border;

  const clamped = Number.isFinite(progress) ? Math.min(1, Math.max(0, progress)) : 0;
  const span = Math.min(FULL_TURN, Math.max(0, sweep));
  const filled = span * clamped;

  return (
    <View
      style={{ width: size, height: size }}
      // One element to assistive technology, not eight: the arcs are a drawing
      // of a figure that is always written out beside them.
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View
        style={[
          styles.frame,
          { width: size, height: size, transform: [{ rotate: `${startAngle}deg` }] },
        ]}
      >
        <Arc size={size} thickness={thickness} angle={span} color={track} />
        <Arc size={size} thickness={thickness} angle={filled} color={color} />
      </View>

      {children === undefined ? null : <View style={styles.centre}>{children}</View>}
    </View>
  );
}

const FULL_TURN = 360;
const HALF_TURN = 180;

/**
 * One arc from twelve o'clock, clockwise, with both ends rounded.
 *
 * Nothing at all below a degree: at that width the two caps would meet and
 * paint a dot on a gauge nobody has started.
 */
function Arc({
  size,
  thickness,
  angle,
  color,
}: {
  size: number;
  thickness: number;
  angle: number;
  color: string;
}) {
  if (angle <= 0) return null;

  const circle = {
    position: 'absolute' as const,
    width: size,
    height: size,
    borderRadius: size / 2,
    borderWidth: thickness,
  };

  const half = {
    borderColor: 'transparent',
    borderTopColor: color,
    borderRightColor: color,
  };

  return (
    <>
      <View style={[styles.mask, { left: size / 2, width: size / 2, height: size }]}>
        <View
          style={[
            circle,
            half,
            {
              left: -size / 2,
              top: 0,
              transform: [{ rotate: `${Math.min(angle, HALF_TURN) - 135}deg` }],
            },
          ]}
        />
      </View>

      <View style={[styles.mask, { left: 0, width: size / 2, height: size }]}>
        <View
          style={[
            circle,
            half,
            {
              left: 0,
              top: 0,
              transform: [{ rotate: `${Math.max(angle - HALF_TURN, 0) + 45}deg` }],
            },
          ]}
        />
      </View>

      {/*
        A closed circle has no ends. Anything short of one has two, and they are
        rounded the way every progress bar in the application is.
      */}
      {angle >= FULL_TURN ? null : (
        <>
          <Cap size={size} thickness={thickness} angle={0} color={color} />
          <Cap size={size} thickness={thickness} angle={angle} color={color} />
        </>
      )}
    </>
  );
}

/**
 * A round end, placed on the arc's centre line.
 *
 * Its diameter IS the stroke thickness and its centre sits at the radius the
 * stroke is drawn along, so it is the round cap rather than something shaped
 * like one. Angles run clockwise from twelve, which is why sine carries x and
 * cosine carries a NEGATED y: the screen's y axis points down.
 */
function Cap({
  size,
  thickness,
  angle,
  color,
}: {
  size: number;
  thickness: number;
  angle: number;
  color: string;
}) {
  const radius = (size - thickness) / 2;
  const radians = (angle * Math.PI) / HALF_TURN;

  return (
    <View
      style={{
        position: 'absolute',
        width: thickness,
        height: thickness,
        borderRadius: thickness / 2,
        backgroundColor: color,
        left: size / 2 + radius * Math.sin(radians) - thickness / 2,
        top: size / 2 - radius * Math.cos(radians) - thickness / 2,
      }}
    />
  );
}

const styles = StyleSheet.create({
  frame: { position: 'absolute', top: 0, left: 0 },
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
