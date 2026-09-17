import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { regionsOfView, regionsForMuscle, viewBoxOf } from '../body-map/body-map';
import { levelOf, volumeText, type MuscleVolume, type VolumeLevel } from '../domain/muscle-volume';
import { muscleLabel } from '../domain/vocabulary';
import type { MuscleRole } from '../domain/exercise-draft';

/**
 * The body map of a routine (specs 10.2, 10.6).
 *
 * > Carte corporelle des muscles travaillés
 *
 * react-native-svg, which D13 already requires for the charts and names for
 * this exact use. No new dependency, and therefore no CI cycle.
 *
 * ## THE SHADE SAYS HOW MUCH, NOT JUST WHETHER
 *
 * Four steps rather than lit/unlit, and rather than a continuous gradient: the
 * eye cannot rank two reds a few percent apart, so a smooth scale reads as
 * noise and claims a precision this has none of. The thresholds and the
 * half-weight for a secondary set live in domain/muscle-volume.ts, where they
 * are testable and flagged as chosen.
 *
 * ## THE ERROR THIS IS DESIGNED AROUND IS THE FALSE NEGATIVE
 *
 * A muscle worked but left grey reads as "I never train that" — a wrong belief
 * acted on for weeks. A region shaded one step too dark costs nothing. So the
 * lightest band starts at the first half-set: anything worked at all is
 * visible, and the shading ranks what is visible.
 *
 * ## TOUCHING A REGION NAMES IT
 *
 * Specs 10.6 already settles the interaction for every graph in this
 * application — "toucher un point affiche sa valeur et sa date" — and no zoom
 * or pan anywhere. This is the same sentence applied to a drawing: one touch,
 * one answer, dismissed by touching anywhere else.
 *
 * An UNMAPPED region answers too, saying it is part of the silhouette. Silence
 * would be indistinguishable from a touch that missed.
 *
 * ## AND THE REGION ITSELF SAYS SO
 *
 * The first version answered in words under the figures and left the drawing
 * untouched, so the one thing it could not tell you was WHERE the muscle you
 * just touched is — on a map, of all things. The touched muscle is outlined,
 * every region of it at once, so the name below and the shape above are the
 * same answer.
 *
 * ## TWO WAYS TO SHADE, AND THEY ANSWER TWO QUESTIONS
 *
 * `volume` is a routine's: how much work each muscle gets, in four steps. `roles`
 * is one exercise's: principal or secondary, which has no quantity at all. A
 * caller gives one or the other, never both — an exercise has no sets to count
 * and a routine has no single primary.
 */
export function BodyMapView({
  muscles,
  volume,
  roles,
  height = 260,
}: {
  /** The muscles worked. Strings, off columns that carry no CHECK. */
  muscles: readonly string[];
  /** How many sets each carries. Absent on a screen that only knows "worked". */
  volume?: ReadonlyMap<string, MuscleVolume>;
  /** Principal or secondary, for one exercise. Never given beside `volume`. */
  roles?: ReadonlyMap<string, MuscleRole>;
  height?: number;
}) {
  const theme = useTheme();
  const [touched, setTouched] = useState<string | null>(null);

  /**
   * Slug -> shade, resolved once.
   *
   * A muscle owns one or more regions and every one of them takes its level, so
   * `chest` and `serratus` shade together — they are one muscle to the reader.
   */
  const levelBySlug = useMemo(() => {
    const levels = new Map<string, VolumeLevel>();
    for (const muscle of muscles) {
      const level = levelFor(muscle, volume, roles);
      for (const slug of regionsForMuscle(muscle)) levels.set(slug, level);
    }
    return levels;
  }, [muscles, volume, roles]);

  /** Slug -> the muscle that owns it, for the tooltip. */
  const muscleBySlug = useMemo(() => {
    const owner = new Map<string, string>();
    for (const muscle of muscles) {
      for (const slug of regionsForMuscle(muscle)) owner.set(slug, muscle);
    }
    return owner;
  }, [muscles]);

  const touchedMuscle = touched === null ? null : (muscleBySlug.get(touched) ?? null);

  /** Every region of the touched muscle, so the outline follows the muscle. */
  const outlined = useMemo(() => {
    if (touchedMuscle === null) return new Set<string>();
    return new Set(regionsForMuscle(touchedMuscle));
  }, [touchedMuscle]);

  const shades: Record<VolumeLevel, string> = {
    0: theme.colors.border,
    1: theme.colors.muscleLight,
    2: theme.colors.muscleMid,
    3: theme.colors.accent,
  };

  return (
    <Pressable onPress={() => setTouched(null)} accessibilityRole="none">
      <View style={styles.figures}>
        {(['front', 'back'] as const).map((view) => (
          <Figure
            key={view}
            view={view}
            levelBySlug={levelBySlug}
            shades={shades}
            outlined={outlined}
            height={height}
            label={view === 'front' ? 'Face' : 'Dos'}
            onTouch={setTouched}
          />
        ))}
      </View>

      <Tooltip slug={touched} muscle={touchedMuscle} volume={volume} roles={roles} />
    </Pressable>
  );
}

function Figure({
  view,
  levelBySlug,
  shades,
  outlined,
  height,
  label,
  onTouch,
}: {
  view: 'front' | 'back';
  levelBySlug: ReadonlyMap<string, VolumeLevel>;
  shades: Record<VolumeLevel, string>;
  /** Slugs of the touched muscle, drawn with an outline. */
  outlined: ReadonlySet<string>;
  height: number;
  label: string;
  onTouch: (slug: string) => void;
}) {
  const theme = useTheme();
  const regions = useMemo(() => regionsOfView(view), [view]);
  const box = useMemo(() => viewBoxOf(view), [view]);

  const lit = regions.filter((region) => levelBySlug.has(region.slug)).length;

  return (
    <View style={styles.figure}>
      <Svg
        height={height}
        width="100%"
        viewBox={box}
        accessibilityRole="image"
        accessibilityLabel={`${label} : ${lit === 0 ? 'aucun muscle travaillé' : `${lit} zones travaillées`}`}
      >
        {regions.map((region, index) => (
          <Path
            key={`${region.slug}-${region.side}-${index}`}
            d={region.d}
            fill={shades[levelBySlug.get(region.slug) ?? 0]}
            /*
              THE OUTLINE IS IN viewBox UNITS, NOT POINTS, and that is the whole
              reason this number looks large. The figures are about 1 270 units
              tall and the height in points is what binds, so a unit is worth
              height/1270 of a point — twelve of them are close to two points at
              every size this is drawn at. Arithmetic rather than taste: nothing
              here can be looked at from this machine.

              In the text colour rather than the accent: the fill is already a
              shade of the accent, and an outline of the same hue on top of it
              is not an outline.
            */
            stroke={outlined.has(region.slug) ? theme.colors.text : undefined}
            strokeWidth={outlined.has(region.slug) ? OUTLINE_UNITS : 0}
            // Only a worked region answers: the silhouette is scenery, and a
            // tooltip saying "Tête" would be a control that looks broken.
            onPress={levelBySlug.has(region.slug) ? () => onTouch(region.slug) : undefined}
          />
        ))}
      </Svg>
      <Text style={[styles.caption, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

/**
 * What a touched region says.
 *
 * The name and the set count, in whole numbers — never the weighted total,
 * which contains halves nobody performed. A reserved line rather than a floating
 * bubble: a tooltip that appears above the figure would push the page, and one
 * that floats would need to dodge the finger.
 */
function Tooltip({
  slug,
  muscle,
  volume,
  roles,
}: {
  slug: string | null;
  muscle: string | null;
  volume?: ReadonlyMap<string, MuscleVolume>;
  roles?: ReadonlyMap<string, MuscleRole>;
}) {
  const theme = useTheme();

  if (slug === null || muscle === null) {
    return (
      <View style={styles.tooltip}>
        <Text style={[styles.hint, { color: theme.colors.textMuted }]}>
          Touchez un muscle coloré pour le détail.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.tooltip}>
      <Text style={[styles.name, { color: theme.colors.text }]}>{muscleLabel(muscle)}</Text>
      <Text style={[styles.count, { color: theme.colors.textMuted }]}>
        {detailOf(muscle, volume, roles)}
      </Text>
    </View>
  );
}

/** Roughly two points, at every height this map is drawn at. See its use. */
const OUTLINE_UNITS = 12;

/**
 * The step a muscle is shaded at.
 *
 * Roles first: an exercise names one principal muscle and some helpers, which
 * is not a quantity — so it takes the top step and the bottom of the lit three,
 * far enough apart to be told apart at a glance. Without either a tally or a
 * role the map still works, at its lightest step: a screen that only knows
 * "worked" gets lit regions rather than none.
 */
function levelFor(
  muscle: string,
  volume: ReadonlyMap<string, MuscleVolume> | undefined,
  roles: ReadonlyMap<string, MuscleRole> | undefined,
): VolumeLevel {
  const role = roles?.get(muscle);
  if (role !== undefined) return role === 'primary' ? 3 : 2;

  const tally = volume?.get(muscle);
  return tally === undefined ? 1 : levelOf(tally.weighted);
}

/** What the line under the figures says about the touched muscle. */
function detailOf(
  muscle: string,
  volume: ReadonlyMap<string, MuscleVolume> | undefined,
  roles: ReadonlyMap<string, MuscleRole> | undefined,
): string {
  const role = roles?.get(muscle);
  if (role !== undefined) return role === 'primary' ? 'Muscle principal' : 'Muscle secondaire';

  const tally = volume?.get(muscle);
  return tally === undefined ? 'Travaillé' : volumeText(tally);
}

const styles = StyleSheet.create({
  /**
   * Breathing room ABOVE the figures only.
   *
   * They are drawn to the edge of their viewBox, so a head touching the top of
   * a card reads as cropped rather than as framed. Below them the space belongs
   * to the card, not here: padding under the drawing separated the figures from
   * their own captions instead of the card from what follows it.
   */
  figures: { flexDirection: 'row', gap: 12, paddingTop: 16 },
  figure: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  caption: { fontSize: 12 },
  tooltip: {
    marginTop: 10,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  hint: { fontSize: 13 },
  name: { fontSize: 15, fontWeight: '600' },
  count: { fontSize: 13 },
});
