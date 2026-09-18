import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { G, Path } from 'react-native-svg';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { catalogKeyOf } from '../catalog/exercises';
import { EXERCISE_DRAWINGS, type DrawingPose } from '../catalog/drawings.generated';

/**
 * The two-pose drawing of an exercise (specs 10.1, slice 11).
 *
 * ## IT IS AN ANIMATION OF TWO FRAMES, AND THAT IS WHAT A REPETITION IS
 *
 * The source draws the bottom of the movement and the top. Alternating them is
 * not a compromise for want of a video: a repetition IS those two positions,
 * and everything between them is the part nobody needs a picture of.
 *
 * ## NO ALIGNMENT, BECAUSE THE TWO POSES SHARE A viewBox
 *
 * Verified at extraction and refused there if it ever stops holding. It matters
 * because the PNG renderings of the same drawings do NOT share one — they are
 * cropped to their own ink, 947x1064 against 948x860 for the bench press — so
 * the obvious "just swap the image" would have made the figure jump. Here the
 * frames are two path lists in one box, and nothing moves but the ink.
 *
 * ## IT IS NOT A REANIMATED ANIMATION, AND IT MUST NOT BECOME ONE
 *
 * Two frames swapped by an interval, not a cross-fade. The project's rule is
 * that a Reanimated animation belongs to a freshly mounted view with a single
 * write to a shared value — and there is nothing here for that shape to do: a
 * bench press does not dissolve into another bench press, it moves. A
 * cross-fade would draw both positions at once at half strength, which reads as
 * a double exposure rather than as a lift.
 *
 * ## AND THE COLOURS COME FROM THE THEME, WHICH IS THE POINT OF TAKING THE SVG
 *
 * The source is ink on paper: #333 lines on a #fff sheet. Rendered as-is on a
 * dark card it would be a white hole in the page. The two groups map to two
 * tokens instead, so the drawing is the page's own surface with the page's own
 * text drawn on it, in both themes.
 */
export function ExerciseDrawing({
  mediaUri,
  height = 160,
  animated = true,
}: {
  /** exercise.media_uri. A `catalog:` value has a drawing; a file name does not. */
  mediaUri: string | null;
  height?: number;
  animated?: boolean;
}) {
  const theme = useTheme();
  const key = catalogKeyOf(mediaUri);
  const drawing = key === null ? undefined : EXERCISE_DRAWINGS[key];

  const [contracted, setContracted] = useState(false);

  useEffect(() => {
    if (!animated || drawing === undefined) return;
    const timer = setInterval(() => setContracted((current) => !current), FRAME_MS);
    return () => clearInterval(timer);
  }, [animated, drawing]);

  /**
   * NO DRAWING IS A SUPPORTED STATE, not a failure.
   *
   * Specs 5.4 no 3: "après un import, un média absent affiche un substitut ;
   * l'application ne doit jamais planter pour cette raison". Three ways to get
   * here, and all three are ordinary: an exercise the user created, an archive
   * naming a catalogue key this build does not ship, and `gainage`, which is in
   * the catalogue with no drawing at all because the source has no front plank.
   * That last one exercises this path on day one rather than leaving it to be
   * discovered.
   */
  if (drawing === undefined) {
    return (
      <View
        style={[
          styles.substitute,
          { height, backgroundColor: theme.colors.background, borderRadius: theme.radius.md },
        ]}
      >
        <SymbolView
          name="figure.strengthtraining.traditional"
          tintColor={theme.colors.textFaint}
          size={28}
          fallback={<Text style={{ color: theme.colors.textFaint }}>—</Text>}
        />
      </View>
    );
  }

  const pose: DrawingPose = contracted ? drawing.contracted : drawing.relaxed;

  return (
    <View style={[styles.frame, { height }]}>
      <Svg width="100%" height="100%" viewBox={drawing.viewBox}>
        {/*
          The paper first, then the ink over it — the source's own order, and
          the only one that works: the paper path is the whole canvas with the
          figure knocked out of it, so drawn second it would cover everything.
        */}
        <G fill={theme.colors.surface}>
          {pose.paper.map((d, index) => (
            <Path key={`paper-${index}`} d={d} />
          ))}
        </G>
        <G fill={theme.colors.text}>
          {pose.ink.map((d, index) => (
            <Path key={`ink-${index}`} d={d} />
          ))}
        </G>
      </Svg>
    </View>
  );
}

/**
 * How long each pose is held.
 *
 * A CHOICE, not a measurement, living beside its reason. Slow enough that the
 * two positions read as two positions rather than as a flicker; fast enough
 * that a glance catches both. A repetition performed properly takes two or
 * three seconds, so this is roughly a real tempo — which is the only thing that
 * makes a two-frame loop look like a movement instead of a blink.
 */
const FRAME_MS = 900;

const styles = StyleSheet.create({
  frame: { width: '100%' },
  substitute: { width: '100%', alignItems: 'center', justifyContent: 'center' },
});
