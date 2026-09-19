import { Image, StyleSheet, View } from 'react-native';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { catalogKeyOf } from '../catalog/exercises';
import { EXERCISE_IMAGES } from '../catalog/images.generated';

/**
 * The photographs of an exercise (specs 10.1).
 *
 * ## TWO STILLS, AND THE PAIR IS THE MOVEMENT
 *
 * The first version of this slice animated two poses from everkinetic's SVGs;
 * the second showed one wger drawing with the start and the end side by side.
 * free-exercise-db gives two PHOTOGRAPHS — [0] is the start position, [1] is
 * the end — which says the same thing the animation did, in a glance rather
 * than in two seconds, and says it about a real body.
 *
 * So `poses` decides how much of that is worth the space. A 44 pt list row
 * shows the first: at that size two images are two thumbnails of nothing. The
 * exercise page shows BOTH, because "how deep was that squat" is exactly the
 * question a single frame cannot answer.
 *
 * ## AND THEY ARE ASSETS, WHICH IS WHY THE BUNDLE DID NOT GROW
 *
 * An inlined SVG path is a string constant Hermes parses at every cold start —
 * about 40 KB per exercise, and the paths could not be shortened because they
 * contain arcs, the case slice 10 documented as undecidable to re-serialise.
 * A JPEG is an asset: never parsed, loaded when it is rendered. Eight hundred
 * exercises cost the JavaScript bundle nothing; they cost 37 MB of assets,
 * which is a different budget.
 *
 * ## THE WHITE CARD IS A CONSEQUENCE, STATED RATHER THAN DISCOVERED
 *
 * A photograph does not take the theme. These were shot on a light gym floor,
 * so on a dark card they would be a bright hole in the page. The image
 * therefore sits on its own PAPER-coloured card in both themes — which reads as
 * a photograph, the way every training application shows one, rather than as a
 * surface that failed to follow the theme.
 */
export function ExerciseDrawing({
  mediaUri,
  height = 160,
  poses = 'first',
}: {
  /** exercise.media_uri. A `catalog:` value may have images; a file name does not. */
  mediaUri: string | null;
  height?: number;
  /** `both` puts the start and the end side by side. See the note above. */
  poses?: 'first' | 'both';
}) {
  const theme = useTheme();
  const key = catalogKeyOf(mediaUri);
  const all = key === null ? undefined : EXERCISE_IMAGES[key];
  const sources = all === undefined || all.length === 0 ? undefined : all;

  /**
   * NO IMAGE IS A SUPPORTED STATE, not a failure.
   *
   * Specs 5.4 no 3: "après un import, un média absent affiche un substitut ;
   * l'application ne doit jamais planter pour cette raison". Four ways to get
   * here and all four are ordinary: an exercise the user created, a file they
   * chose that this build cannot resolve, an archive naming a catalogue key a
   * newer binary had, and the three catalogue entries free-exercise-db
   * describes without photographing. That last one is rare now — it used to be
   * three hundred and twenty-three — so the path is held open by a test rather
   * than by daily use.
   */
  if (sources === undefined) {
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

  const shown = poses === 'both' ? sources : sources.slice(0, 1);

  return (
    <View style={[styles.paper, { height, borderRadius: theme.radius.md }]}>
      {shown.map((source, index) => (
        <Image
          // The array is a fixed list of module ids; there is no other identity
          // to key on, and it never reorders.
          key={index}
          source={source}
          style={styles.image}
          // The whole figure, never cropped: these are wide frames and a fill
          // would cut the bar off the exercise the page is about.
          resizeMode="contain"
          accessibilityIgnoresInvertColors
        />
      ))}
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
  paper: {
    width: '100%',
    backgroundColor: '#ffffff',
    overflow: 'hidden',
    // A row, so `both` puts the start and the end beside each other and `first`
    // is the same rule with one child.
    flexDirection: 'row',
  },
  image: { flex: 1, height: '100%' },
  substitute: { width: '100%', alignItems: 'center', justifyContent: 'center' },
});
