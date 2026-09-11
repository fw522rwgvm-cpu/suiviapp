import { EmptyState } from '@/core/ui/empty-state';

// Nutrition panel at slice 7, weight at slice 8, strength at slice 12.
export function StatsScreen() {
  return (
    <EmptyState
      symbol="chart.xyaxis.line"
      title="Aucune statistique"
      message="Le tableau de bord se remplira quand il y aura des données à agréger."
      note="Volet nutrition en fin de V1, poids en V2, musculation en V3."
    />
  );
}
