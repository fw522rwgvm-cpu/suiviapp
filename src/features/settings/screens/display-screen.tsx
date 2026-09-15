import { MAX_CUTOFF_HOUR, MIN_CUTOFF_HOUR } from '@/core/date';
import { ChoiceRow, SettingsCard, SettingsNote, SettingsPage } from '@/core/ui/settings-list';
import { usePreferences, useSetCutoffHour } from '../data/settings-queries';

/**
 * Affichage — the hour at which the day turns over (specs 8.2, 8.8, 12).
 */

/**
 * Midnight to six, which is exactly the range specs 8.2 bounds it to.
 *
 * Built from the bounds rather than written out, so the list and the clamp can
 * never disagree: an option the clamp would refuse could otherwise be offered.
 */
const CUTOFF_HOURS: readonly number[] = Array.from(
  { length: MAX_CUTOFF_HOUR - MIN_CUTOFF_HOUR + 1 },
  (_, index) => MIN_CUTOFF_HOUR + index,
);

export function cutoffLabel(hour: number): string {
  return hour === 0 ? 'Minuit' : `${hour} h`;
}

export function DisplayScreen() {
  const preferences = usePreferences();
  const setCutoffHour = useSetCutoffHour();

  return (
    <SettingsPage>
      <SettingsCard>
        {CUTOFF_HOURS.map((hour, index) => (
          <ChoiceRow
            key={hour}
            label={cutoffLabel(hour)}
            selected={preferences.cutoffHour === hour}
            first={index === 0}
            onPress={() => setCutoffHour.mutate(hour)}
          />
        ))}
      </SettingsCard>
      <SettingsNote>
        Heure à laquelle la journée bascule. Avant elle, le Journal s’ouvre encore sur la
        veille. Ça ne change que la date proposée par défaut : rien de ce qui est déjà
        enregistré ne bouge, et une date se corrige en un geste.
      </SettingsNote>
      <SettingsNote>
        Le rappel de pesée en tient compte : il porte sur la date que l’application
        appelle « aujourd’hui » à l’heure où il sonne.
      </SettingsNote>
    </SettingsPage>
  );
}
