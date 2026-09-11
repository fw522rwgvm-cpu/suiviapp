import { EmptyState } from '@/core/ui/empty-state';

/**
 * The Entrainement tab (specs 7). It will eventually hold a segmented selector
 * between Musculation and Activites, within a single screen and without a
 * nested navigator.
 *
 * Placed in the strength domain because that is the section it opens on.
 * Activites belongs to its own domain and arrives in V4; where the segmented
 * shell should live once it composes both is left open until slice 10, rather
 * than settled now by inventing a domain the project tree does not list.
 */
export function TrainingScreen() {
  return (
    <EmptyState
      symbol="figure.strengthtraining.traditional"
      title="Aucun entraînement"
      message="La musculation arrive en V3, les activités d’endurance en V4."
      note="Cet onglet restera en place d’ici là, comme les quatre onglets fixes."
    />
  );
}
