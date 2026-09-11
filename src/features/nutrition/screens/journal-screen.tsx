import { EmptyState } from '@/core/ui/empty-state';

// Slice 1 brings materialising a day, meals, free entry, the remaining banner
// and day navigation (architecture, section 7).
export function JournalScreen() {
  return (
    <EmptyState
      symbol="fork.knife"
      title="Journal vide"
      message="Le socle est en place : la base de données s’ouvre et les quatre onglets répondent."
      note="La saisie des repas arrive à la tranche suivante."
    />
  );
}
