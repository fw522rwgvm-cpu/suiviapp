import { Image, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { catalogKeyOf } from '../catalog/exercises';
import { EXERCISE_IMAGES } from '../catalog/images.generated';

/**
 * The drawing of an exercise (specs 10.1).
 *
 * ## IT IS A STILL, AND THE SOURCE IS WHY THAT IS ENOUGH
 *
 * The first version of this slice animated two poses from everkinetic's SVGs.
 * wger's drawings show the START AND THE END SIDE BY SIDE, with an arrow
 * between them — which is what the animation was saying, in a glance instead of
 * in two seconds. Nothing moves, nothing has to be timed, and a list of them
 * sits still to be read.
 *
 * ## AND IT IS AN ASSET, WHICH IS WHY THE BUNDLE DID NOT GROW
 *
 * An inlined SVG path is a string constant Hermes parses at every cold start —
 * about 40 KB per exercise, and the paths could not be shortened because they
 * contain arcs, the case slice 10 documented as undecidable to re-serialise.
 * A PNG is an asset: never parsed, loaded when it is rendered. Five hundred
 * exercises cost the JavaScript bundle nothing.
 *
 * ## THE WHITE CARD IS A CONSEQUENCE, STATED RATHER THAN DISCOVERED
 *
 * A PNG does not take the theme. These are black lines on white, so on a dark
 * card they would be a hole in the page. The drawing therefore sits on its own
 * PAPER-coloured card in both themes — which reads as a photograph, the way
 * every training application shows one, rather than as a surface that failed to
 * follow the theme.
 *
 * Inverting in dark mode was the alternative and is refused: it would need the
 * pixels processed at build time, for a result that looks like a negative.
 */
export function ExerciseDrawing({
  mediaUri,
  height = 160,
}: {
  /** exercise.media_uri. A `catalog:` value may have an image; a file name does not. */
  mediaUri: string | null;
  height?: number;
}) {
  const theme = useTheme();
  const key = catalogKeyOf(mediaUri);
  const source = key === null ? undefined : EXERCISE_IMAGES[key];

  /**
   * NO IMAGE IS A SUPPORTED STATE, not a failure.
   *
   * Specs 5.4 no 3: "après un import, un média absent affiche un substitut ;
   * l'application ne doit jamais planter pour cette raison". Four ways to get
   * here and all four are ordinary: an exercise the user created, a file they
   * chose that this build cannot resolve, an archive naming a catalogue key a
   * newer binary had, and the three hundred and twenty-three catalogue entries
   * wger describes without drawing. That last one exercises this path on day
   * one rather than leaving it to be discovered.
   */
  if (source === undefined) {
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
          size={Math.min(28, height / 2)}
          fallback={<Text style={{ color: theme.colors.textFaint }}>—</Text>}
        />
      </View>
    );
  }

  return (
    <View style={[styles.paper, { height, borderRadius: theme.radius.md }]}>
      <Image
        source={source}
        style={styles.image}
        // The whole drawing, never cropped: these are wide figures and a fill
        // would cut the arms off the exercise the page is about.
        resizeMode="contain"
        accessibilityIgnoresInvertColors
      />
    </View>
  );
}

const styles = StyleSheet.create({
  /**
   * White in BOTH themes, deliberately.
   *
   * Not `theme.colors.surface`: the ink in these files is black, so the paper
   * has to stay light or the lines vanish. A fixed colour is the honest form of
   * "this is a picture", and it is the one place in the application a surface
   * does not follow the theme.
   */
  paper: { width: '100%', backgroundColor: '#ffffff', overflow: 'hidden' },
  image: { width: '100%', height: '100%' },
  substitute: { width: '100%', alignItems: 'center', justifyContent: 'center' },
});
