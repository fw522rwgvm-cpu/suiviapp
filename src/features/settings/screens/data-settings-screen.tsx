import { SettingsPage } from '@/core/ui/settings-list';
import { DataSection } from '@/features/backup/components/data-section';

/**
 * Données — export, import, "préparer une copie" (specs 5.4, 12).
 *
 * DataSection is mounted whole rather than taken apart. It carries its own
 * groups, its own captions and its own spacing, written before the shared
 * pieces existed and matched by them; rebuilding it out of SettingsCard would
 * be a rewrite of the one screen that guards the only safety net there is.
 */
export function DataSettingsScreen() {
  return (
    <SettingsPage>
      <DataSection />
    </SettingsPage>
  );
}
