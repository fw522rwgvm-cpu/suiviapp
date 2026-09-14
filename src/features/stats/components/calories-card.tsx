import type { ReactNode } from 'react';
import type { NutritionPanel } from '../domain/panel';
import { describeMeanBasis, formatMeanKcal } from '../domain/stats-text';
import { StatCard } from './stat-card';

/**
 * Calories per day, against the goal (specs 8.7).
 *
 * The headline is the MEAN, not today's figure: the Journal already answers
 * "where am I now", and repeating it here would make the two screens compete
 * to say the same thing. What this screen adds is the shape of a fortnight.
 *
 * The goal is stated beside it rather than subtracted from it. A single
 * "écart" figure would hide which of the two moved — and over ninety days the
 * goal itself changes, one template to another.
 *
 * `chart` is a slot rather than a chart, and that is how the slice was
 * ordered: everything here works on the installed binary, and the drawing
 * arrives last with react-native-svg, which is native and costs a CI cycle.
 */
export function CaloriesCard({
  panel,
  chart,
}: {
  panel: NutritionPanel;
  chart?: ReactNode;
}) {
  return (
    <StatCard
      title="Calories"
      headline={formatMeanKcal(panel.meanConsumed?.kcal ?? null)}
      caption={
        panel.meanTargetKcal === null
          ? 'Moyenne par jour. Aucun objectif sur cette plage.'
          : `Moyenne par jour, pour un objectif moyen de ${formatMeanKcal(panel.meanTargetKcal)}.`
      }
      note={describeMeanBasis(panel.recorded, panel.range)}
    >
      {chart}
    </StatCard>
  );
}
