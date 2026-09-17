import { MUSCLES, type Muscle } from '@/core/db/schema';
import { BODY_REGIONS, BODY_SLUGS, BODY_VIEW_BOXES, type BodyRegion } from './paths.generated';

/**
 * Which regions of the drawing each muscle lights (specs 10.2, the body map).
 *
 * ## THE TWO VOCABULARIES ARE DIFFERENT, AND THAT IS THE POINT OF THIS FILE
 *
 * The application stores fifteen muscle groups, at the granularity someone
 * labels an exercise with. The drawing carves the body into twenty-five named
 * regions at an anatomical granularity. Neither is wrong and neither should
 * bend to the other: a mapping is one small table, and making the schema follow
 * a third-party drawing would have tied the column to a repository.
 *
 * ## WHAT IS DELIBERATELY UNMAPPED
 *
 * Eight slugs light for nothing: head, hair, neck, hands, knees, ankles, feet,
 * and `tibialis`. The first seven DRAW THE BODY — they are what gives a routine
 * working one muscle a silhouette to sit in, rather than a limb floating on
 * white.
 *
 * `tibialis` is the one that is a decision. It is the tibialis anterior, the
 * ANTAGONIST of the calf: lighting it with `calves` would be pretty and wrong.
 * It stays grey, and the shin of a calf routine stays grey with it.
 *
 * ## TWO MAPPINGS ARE ANATOMICALLY APPROXIMATE, AND SAY SO
 *
 * `serratus` under chest and `hip-flexors` under quads. Neither is true — the
 * serratus is thoracic, the psoas is not a quadriceps — but each is the
 * NEIGHBOURING group on the drawing, and each is tiny: four marks on the ribs,
 * two ovals at the groin. Leaving them grey was the first instinct and it is
 * worse: on a drawing where the surrounding region is lit, an unlit island
 * reads as a rendering fault rather than as a muscle at rest.
 *
 * The functional case supports both anyway. Everything that recruits the
 * serratus — presses, push-ups, dips — recruits the chest; and the rectus
 * femoris genuinely IS both a quadriceps and a hip flexor.
 *
 * `lats` maps to `upper-back`, which covers the rhomboids and mid traps as well
 * as the latissimus. The word is the one used in a gym; the drawing is slightly
 * wider than the word. Stated rather than hidden.
 */
const MUSCLE_REGIONS: Record<Muscle, readonly string[]> = {
  chest: ['chest', 'serratus'],
  shoulders: ['deltoids'],
  biceps: ['biceps'],
  triceps: ['triceps'],
  forearms: ['forearm'],
  abs: ['abs'],
  obliques: ['obliques'],
  lats: ['upper-back'],
  traps: ['trapezius'],
  lower_back: ['lower-back'],
  glutes: ['gluteal'],
  quads: ['quadriceps', 'hip-flexors'],
  hamstrings: ['hamstring'],
  adductors: ['adductors'],
  calves: ['calves'],
};

/** The regions a muscle lights. Empty for a value this build does not know. */
export function regionsForMuscle(muscle: string): readonly string[] {
  return REGION_LOOKUP.get(muscle) ?? [];
}

const REGION_LOOKUP = new Map<string, readonly string[]>(Object.entries(MUSCLE_REGIONS));

/**
 * Every slug a set of muscles lights.
 *
 * Takes strings rather than Muscle, because the caller reads them off columns
 * that carry no CHECK. An unknown one contributes nothing, which is the same
 * answer the labels give: a value this build does not know is carried, never
 * corrected, and simply lights nothing.
 */
export function litSlugs(muscles: Iterable<string>): Set<string> {
  const lit = new Set<string>();
  for (const muscle of muscles) {
    for (const slug of regionsForMuscle(muscle)) lit.add(slug);
  }
  return lit;
}

/** The regions of one view, for rendering. */
export function regionsOfView(view: 'front' | 'back'): readonly BodyRegion[] {
  return BODY_REGIONS.filter((region) => region.view === view);
}

/**
 * The viewBox of a figure, measured at extraction rather than computed here.
 *
 * NOT PARSED AT RUNTIME, and that is a decision the data forced. One region
 * carries `a2.05 2.05 0 1.92-2.71` — an arc offering five numbers where seven
 * are needed, with its two single-digit flags run together with what follows in
 * a way no tokeniser can undo. The two possible readings put the front figure's
 * right edge 150 units apart, and the wider one overlaps the back figure and
 * shrinks both.
 *
 * Since the paths are generated and never change, the box is a CONSTANT.
 * scripts/extract-body-map.mjs measures it once, flattening the curves, and a
 * wrong box then shows as a visibly misplaced figure rather than as a silent
 * few percent.
 */
export function viewBoxOf(view: 'front' | 'back'): string {
  return BODY_VIEW_BOXES[view];
}

/** Every muscle this build knows, for the exhaustiveness test. */
export function mappedMuscles(): readonly Muscle[] {
  return MUSCLES;
}

/** Every slug the drawing carries. */
export function drawnSlugs(): readonly string[] {
  return BODY_SLUGS;
}

/**
 * The slugs no muscle lights — the silhouette, plus tibialis.
 *
 * Exposed so a test can assert the list rather than a count: the day a mapping
 * is dropped by accident, the failure names the muscle that went dark.
 */
export function unmappedSlugs(): string[] {
  const mapped = new Set(Object.values(MUSCLE_REGIONS).flat());
  return BODY_SLUGS.filter((slug) => !mapped.has(slug));
}
