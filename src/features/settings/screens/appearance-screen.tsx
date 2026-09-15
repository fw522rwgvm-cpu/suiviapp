import { ChoiceRow, SettingsCard, SettingsNote, SettingsPage } from '@/core/ui/settings-list';
import type { ThemePreference } from '@/core/theme';
import { usePreferences, useSetTheme } from '../data/settings-queries';

/**
 * Apparence (specs 8.8, 12).
 *
 * Its own page since the Settings became a page per category. Three rows on a
 * screen of their own is not a waste of a push: the tab's index is now a list
 * of destinations, and a destination that resolved to three rows inline would
 * be the one exception a reader has to remember.
 */

const THEME_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'system', label: 'Système' },
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
];

export function AppearanceScreen() {
  const preferences = usePreferences();
  const setTheme = useSetTheme();

  return (
    <SettingsPage>
      <SettingsCard>
        {THEME_OPTIONS.map((option, index) => (
          <ChoiceRow
            key={option.value}
            label={option.label}
            selected={preferences.theme === option.value}
            first={index === 0}
            onPress={() => setTheme.mutate(option.value)}
          />
        ))}
      </SettingsCard>
      <SettingsNote>
        « Système » suit le réglage de l’iPhone et change avec lui, y compris en cours
        de journée.
      </SettingsNote>
    </SettingsPage>
  );
}

/** What the row on the Settings index says without being opened. */
export function themeLabel(preference: ThemePreference): string {
  return THEME_OPTIONS.find((option) => option.value === preference)?.label ?? 'Système';
}
