import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { litSlugs, regionsOfView, viewBoxOf } from '../body-map/body-map';

/**
 * The body map of a routine (specs 10.2, 10.6).
 *
 * > Carte corporelle des muscles travaillés
 *
 * react-native-svg, which D13 already requires for the charts and names for
 * this exact use: "le même outil sert la carte corporelle, qui est un SVG dont
 * on colore les tracés". No new dependency, and therefore no CI cycle — the
 * native module has been in the binary since slice 7.
 *
 * ## WHAT AN UNLIT REGION IS FOR
 *
 * Eight of the twenty-five regions never light: head, neck, hands, knees,
 * ankles, feet, hair, and the tibialis. They are what makes this a BODY rather
 * than a constellation — a routine working one muscle draws one red shape
 * inside a grey figure, instead of a shape floating on white.
 *
 * ## THE ERROR THIS IS DESIGNED AROUND IS THE FALSE NEGATIVE
 *
 * The map answers "what does this routine cover, and what does it miss". A
 * muscle worked but left grey reads as "I never train that" — a wrong belief
 * acted on for weeks. A region lit slightly too generously costs a shape a few
 * points too wide. So where the two vocabularies do not line up exactly, the
 * mapping errs towards lighting (see body-map.ts on serratus and hip-flexors).
 *
 * ## NO STROKE, AND THAT IS NOT AN OVERSIGHT
 *
 * The regions already leave a hairline of background between them — the drawing
 * is built that way — so outlining each one would double every internal edge
 * and turn a figure into a diagram. Fill alone, in two colours.
 */
export function BodyMapView({
  muscles,
  height = 260,
}: {
  /** The muscles worked. Strings, off columns that carry no CHECK. */
  muscles: readonly string[];
  height?: number;
}) {
  const theme = useTheme();
  const lit = useMemo(() => litSlugs(muscles), [muscles]);

  return (
    <View style={styles.figures}>
      <Figure view="front" lit={lit} height={height} label="Face" />
      <Figure view="back" lit={lit} height={height} label="Dos" />
    </View>
  );
}

function Figure({
  view,
  lit,
  height,
  label,
}: {
  view: 'front' | 'back';
  lit: Set<string>;
  height: number;
  label: string;
}) {
  const theme = useTheme();
  // Both are constant for the life of the process; computed once per view
  // rather than on every render, since the paths never change.
  const regions = useMemo(() => regionsOfView(view), [view]);
  const box = useMemo(() => viewBoxOf(view), [view]);

  return (
    <View style={styles.figure}>
      <Svg
        height={height}
        width="100%"
        viewBox={box}
        // The whole figure is one image to a screen reader; its parts are not
        // separately meaningful, and twenty-five unlabelled paths would be
        // twenty-five stops.
        accessibilityRole="image"
        accessibilityLabel={`${label} : ${lit.size === 0 ? 'aucun muscle' : `${lit.size} zones travaillées`}`}
      >
        {regions.map((region, index) => (
          <Path
            key={`${region.slug}-${region.side}-${index}`}
            d={region.d}
            fill={lit.has(region.slug) ? theme.colors.accent : theme.colors.border}
          />
        ))}
      </Svg>
      <Text style={[styles.caption, { color: theme.colors.textMuted }]}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  figures: { flexDirection: 'row', gap: 12 },
  figure: { flex: 1, minWidth: 0, alignItems: 'center', gap: 6 },
  caption: { fontSize: 12 },
});
