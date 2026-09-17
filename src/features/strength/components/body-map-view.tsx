import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { regionsOfView, regionsForMuscle, viewBoxOf } from '../body-map/body-map';
import { levelOf, volumeText, type MuscleVolume, type VolumeLevel } from '../domain/muscle-volume';
import { muscleLabel } from '../domain/vocabulary';

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
 */
export function BodyMapView({
  muscles,
  volume,
  height = 260,
}: {
  /** The muscles worked. Strings, off columns that carry no CHECK. */
  muscles: readonly string[];
  /** How many sets each carries. Absent on a screen that only knows "worked". */
  volume?: ReadonlyMap<string, MuscleVolume>;
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
      const tally = volume?.get(muscle);
      // Without a tally the map still works, at its lightest step: a screen
      // that only knows "worked" gets lit regions rather than none.
      const level = tally === undefined ? 1 : levelOf(tally.weighted);
      for (const slug of regionsForMuscle(muscle)) levels.set(slug, level);
    }
    return levels;
  }, [muscles, volume]);

  /** Slug -> the muscle that owns it, for the tooltip. */
  const muscleBySlug = useMemo(() => {
    const owner = new Map<string, string>();
    for (const muscle of muscles) {
      for (const slug of regionsForMuscle(muscle)) owner.set(slug, muscle);
    }
    return owner;
  }, [muscles]);

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
            height={height}
            label={view === 'front' ? 'Face' : 'Dos'}
            onTouch={setTouched}
          />
        ))}
      </View>

      <Tooltip
        slug={touched}
        muscle={touched === null ? null : (muscleBySlug.get(touched) ?? null)}
        volume={volume}
      />
    </Pressable>
  );
}

function Figure({
  view,
  levelBySlug,
  shades,
  height,
  label,
  onTouch,
}: {
  view: 'front' | 'back';
  levelBySlug: ReadonlyMap<string, VolumeLevel>;
  shades: Record<VolumeLevel, string>;
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
}: {
  slug: string | null;
  muscle: string | null;
  volume?: ReadonlyMap<string, MuscleVolume>;
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

  const tally = volume?.get(muscle);

  return (
    <View style={styles.tooltip}>
      <Text style={[styles.name, { color: theme.colors.text }]}>{muscleLabel(muscle)}</Text>
      <Text style={[styles.count, { color: theme.colors.textMuted }]}>
        {tally === undefined ? 'Travaillé' : volumeText(tally)}
      </Text>
    </View>
  );
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
