import { useRouter } from 'expo-router';
import { LinkRow, SettingsCard, SettingsNote, SettingsPage } from '@/core/ui/settings-list';
import { PermissionBanner } from '../components/permission-banner';
import { useNotificationSettings } from '../data/notification-queries';
import { NOTIFICATION_LABELS } from '../domain/kinds';
import { useNotificationPermission } from '../hooks/use-notification-permission';

/**
 * The four notifications, one row each (specs 9.3, 12).
 *
 * ## A ROW PER KIND, AND ITS OWN PAGE BEHIND IT
 *
 * The first version put the switch, the hour and — for the export reminder —
 * the delay all inline, with the picker wheel unfolding under its row. It was
 * wrong twice over, and both faults came from one thing: a 180-point native
 * control living in the middle of a scrolling list.
 *
 * Behind a push, each kind gets a page where the wheel is simply part of the
 * layout, with nothing under it to be pushed around and nothing above it to
 * scroll under. That is also what iOS does with its own notification settings —
 * one row per app, the switches inside.
 *
 * The row says the hour without being opened, so checking when something fires
 * costs no navigation; a kind that is off says so rather than showing a time
 * that means nothing.
 */
export function NotificationsScreen() {
  const router = useRouter();
  const settings = useNotificationSettings();
  const { permission } = useNotificationPermission();

  return (
    <SettingsPage>
      <PermissionBanner permission={permission} />

      <SettingsCard>
        {settings.map((setting, index) => (
          <LinkRow
            key={setting.kind}
            label={NOTIFICATION_LABELS[setting.kind]}
            value={
              setting.enabled
                ? `${String(setting.hour).padStart(2, '0')}:${String(setting.minute).padStart(2, '0')}`
                : 'Désactivé'
            }
            first={index === 0}
            onPress={() => router.push(`/(tabs)/settings/notifications/${setting.kind}`)}
          />
        ))}
      </SettingsCard>

      <SettingsNote>
        Les rappels sont programmés sept jours à l’avance et se réactualisent à chaque
        ouverture de l’application. Si elle n’est pas ouverte pendant une semaine, ils
        s’épuisent d’eux-mêmes.
      </SettingsNote>
      <SettingsNote>
        iOS vous demandera l’autorisation au moment où vous activerez le premier, jamais
        avant.
      </SettingsNote>
    </SettingsPage>
  );
}
