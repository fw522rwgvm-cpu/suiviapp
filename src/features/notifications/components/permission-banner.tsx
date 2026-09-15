import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';
import { Text } from '@/core/ui/text';
import type { NotificationPermission } from '../domain/host';

/**
 * Says that iOS is refusing, and where to change it.
 *
 * Shown on both notification screens, because either one can be where the user
 * is when they wonder why nothing rang.
 *
 * ## IT NAMES THE PATH, AND THAT IS THE POINT
 *
 * The settings deliberately stay ON through a refusal — switching them back
 * would make the screen lie about what was asked for. The cost of that choice
 * is a screen showing four things enabled and a system delivering none, so the
 * banner has to close the gap: someone who does not know where to go has no
 * recourse at all.
 *
 * Nothing is drawn for 'undetermined'. Never having been asked is the ordinary
 * state of every installation before the first toggle, and a warning there
 * would be a warning about nothing.
 */
export function PermissionBanner({ permission }: { permission: NotificationPermission }) {
  const theme = useTheme();
  if (permission !== 'denied') return null;

  return (
    <View
      style={[
        styles.banner,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      <Text style={[styles.text, { color: theme.colors.text }]}>
        iOS refuse les notifications pour Suivi.
      </Text>
      <Text style={[styles.detail, { color: theme.colors.textMuted }]}>
        Vos réglages sont conservés : ils s’appliqueront dès que vous les autoriserez dans
        Réglages › Suivi › Notifications.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
    gap: 4,
  },
  text: { fontSize: 15, fontWeight: '600' },
  detail: { fontSize: 13, lineHeight: 18 },
});
