import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { ListSeparator } from '@/core/ui/list-separator';
import { useTheme } from '@/core/theme';
import { TimeWheel } from '../components/time-wheel';
import {
  NOTIFICATION_DESCRIPTIONS,
  NOTIFICATION_LABELS,
  type NotificationKind,
  type NotificationTime,
} from '../domain/kinds';
import type { NotificationPermission } from '../domain/host';
import {
  useExportReminderDays,
  useNotificationSettings,
  useSetExportReminderDays,
  useSetNotificationEnabled,
  useSetNotificationTime,
} from '../data/notification-queries';
import {
  MAX_EXPORT_REMINDER_DAYS,
  MIN_EXPORT_REMINDER_DAYS,
} from '@/features/settings/data/settings-reads';
import { getNotificationHost } from '../host-registry';

/**
 * Activation and hour of the four notifications (specs 9.3, 12).
 *
 * Pushed inside the Settings stack, beside the templates, the planning and the
 * weight goal: browsing is a push, and the windows are for acting on a day.
 *
 * ## AUTHORISATION IS ASKED FOR HERE, AND NOWHERE ELSE
 *
 * Specs 9.3 and D14 are explicit: at activation in the Settings, never at first
 * launch, because "un refus au démarrage est définitif". So the system prompt
 * is raised by the first toggle turned on and by nothing else — not on mount,
 * where reading the status is fine but asking would burn the one chance there
 * is.
 *
 * ## A REFUSAL DOES NOT TURN THE SETTING BACK OFF
 *
 * The row stays on and the screen says iOS is refusing. Switching it back would
 * make the screen lie about what was asked for, and would leave the user with a
 * control that silently undoes itself. Kept on, the day the permission is
 * granted in iOS Settings everything starts firing without anything being
 * touched here — which is the behaviour someone who turned it on expects.
 */
export function NotificationsScreen() {
  const theme = useTheme();
  const settings = useNotificationSettings();
  const setEnabled = useSetNotificationEnabled();
  const setTime = useSetNotificationTime();
  const reminderDays = useExportReminderDays();
  const setReminderDays = useSetExportReminderDays();

  const [permission, setPermission] = useState<NotificationPermission>('undetermined');
  const [openKind, setOpenKind] = useState<NotificationKind | null>(null);

  // Reading the status is not asking for it. This is what lets the banner below
  // be truthful on a screen nobody has touched yet.
  useEffect(() => {
    let alive = true;
    void getNotificationHost()
      .getPermission()
      .then((status) => {
        if (alive) setPermission(status);
      });
    return () => {
      alive = false;
    };
  }, []);

  async function toggle(
    kind: NotificationKind,
    enabled: boolean,
    time: NotificationTime,
  ): Promise<void> {
    // Stored first, so the choice survives whatever iOS answers — including a
    // prompt the user swipes away.
    setEnabled.mutate({ kind, enabled, time });

    if (!enabled) return;
    if (permission === 'granted') return;

    // Turning something on is the act specs 9.3 attaches the prompt to. iOS
    // shows it once per installation; asking again later is a no-op that
    // returns the standing answer, which is why this is safe to call on every
    // activation rather than only the first.
    const answer = await getNotificationHost().requestPermission();
    setPermission(answer);
  }

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.container}
      // The combination react-native-screens expects under a transparent
      // header: the content starts BELOW the bar rather than behind it.
      //
      // "never" plus a declared paddingTop is the OTHER arrangement in this
      // project, and it belongs to the day carousel alone — it is what that
      // screen needs because it calls scrollTo, where an inherited inset makes
      // the resting position non-zero and a negative target gets clamped away.
      // Nothing here scrolls itself, so inheriting is both correct and one
      // fewer number to keep right.
      contentInsetAdjustmentBehavior="automatic"
    >
      {permission === 'denied' ? (
        <View
          style={[
            styles.banner,
            { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
          ]}
        >
          <Text style={[styles.bannerText, { color: theme.colors.text }]}>
            iOS refuse les notifications pour Suivi. Vos réglages sont conservés : ils
            s’appliqueront dès que vous les autoriserez dans Réglages › Suivi ›
            Notifications.
          </Text>
        </View>
      ) : null}

      <View
        style={[
          styles.card,
          { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
        ]}
      >
        {settings.map((setting, index) => (
          <View key={setting.kind}>
            {index === 0 ? null : <ListSeparator />}

            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={[styles.label, { color: theme.colors.text }]}>
                  {NOTIFICATION_LABELS[setting.kind]}
                </Text>
                <Text style={[styles.description, { color: theme.colors.textMuted }]}>
                  {NOTIFICATION_DESCRIPTIONS[setting.kind]}
                </Text>
              </View>
              <Switch
                value={setting.enabled}
                onValueChange={(next) =>
                  void toggle(setting.kind, next, {
                    hour: setting.hour,
                    minute: setting.minute,
                  })
                }
                accessibilityLabel={NOTIFICATION_LABELS[setting.kind]}
              />
            </View>

            {/*
              The hour is offered only once something is on. A time picker under
              a switch that is off is a control for a thing that does not
              happen, and the wheel is 180 points of it.
            */}
            {setting.enabled ? (
              <>
                <ListSeparator />
                <Pressable
                  style={styles.row}
                  onPress={() =>
                    setOpenKind((current) => (current === setting.kind ? null : setting.kind))
                  }
                  accessibilityRole="button"
                >
                  <Text style={[styles.label, { color: theme.colors.text }]}>Heure</Text>
                  <Text style={{ color: theme.colors.accent, fontSize: 17 }}>
                    {String(setting.hour).padStart(2, '0')}:
                    {String(setting.minute).padStart(2, '0')}
                  </Text>
                </Pressable>

                {openKind === setting.kind ? (
                  <TimeWheel
                    value={{ hour: setting.hour, minute: setting.minute }}
                    onChange={(time) => setTime.mutate({ kind: setting.kind, time })}
                  />
                ) : null}

                {/*
                  THE DELAY BELONGS TO THIS ROW, not to a section of its own.

                  export_reminder_days has been readable since slice 2 and
                  settable from nowhere: slice 7 recorded that it would get no
                  control until the reminder existed, because until then the
                  number only decided when an indicator changed colour, which
                  you can see by looking. It decides when a notification fires
                  now, so it is worth choosing — and it is only meaningful while
                  this notification is on, which is why it sits inside the row
                  rather than beside it.
                */}
                {setting.kind === 'export_reminder' ? (
                  <>
                    <ListSeparator />
                    <View style={styles.row}>
                      <Text style={[styles.label, { color: theme.colors.text }]}>Délai</Text>
                      <View style={styles.stepper}>
                        <Pressable
                          onPress={() => setReminderDays.mutate(reminderDays - 1)}
                          disabled={reminderDays <= MIN_EXPORT_REMINDER_DAYS}
                          accessibilityRole="button"
                          accessibilityLabel="Un jour de moins"
                          style={styles.stepperButton}
                        >
                          <Text
                            style={[
                              styles.stepperGlyph,
                              {
                                color:
                                  reminderDays <= MIN_EXPORT_REMINDER_DAYS
                                    ? theme.colors.textFaint
                                    : theme.colors.accent,
                              },
                            ]}
                          >
                            −
                          </Text>
                        </Pressable>
                        <Text style={[styles.stepperValue, { color: theme.colors.text }]}>
                          {reminderDays} j
                        </Text>
                        <Pressable
                          onPress={() => setReminderDays.mutate(reminderDays + 1)}
                          disabled={reminderDays >= MAX_EXPORT_REMINDER_DAYS}
                          accessibilityRole="button"
                          accessibilityLabel="Un jour de plus"
                          style={styles.stepperButton}
                        >
                          <Text
                            style={[
                              styles.stepperGlyph,
                              {
                                color:
                                  reminderDays >= MAX_EXPORT_REMINDER_DAYS
                                    ? theme.colors.textFaint
                                    : theme.colors.accent,
                              },
                            ]}
                          >
                            +
                          </Text>
                        </Pressable>
                      </View>
                    </View>
                  </>
                ) : null}
              </>
            ) : null}
          </View>
        ))}
      </View>

      <Text style={[styles.note, { color: theme.colors.textMuted }]}>
        Les rappels sont programmés sept jours à l’avance et se réactualisent à chaque
        ouverture de l’application. Si elle n’est pas ouverte pendant une semaine, ils
        s’épuisent d’eux-mêmes.
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingBottom: 120, gap: 12 },
  card: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  banner: { borderRadius: 12, borderWidth: StyleSheet.hairlineWidth, padding: 12 },
  bannerText: { fontSize: 14, lineHeight: 19 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    minHeight: 44,
  },
  rowText: { flex: 1, gap: 2 },
  label: { fontSize: 17 },
  description: { fontSize: 13, lineHeight: 17 },
  note: { fontSize: 13, lineHeight: 18, paddingHorizontal: 4 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // 44 points, Apple's minimum touch target — the size slice 8 settled on for
  // the weight card's own two buttons, and for the same reason: these are the
  // only thing in the row anyone aims at.
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepperGlyph: { fontSize: 22 },
  // Fixed, so the row does not shift as the figure goes from one digit to two.
  stepperValue: { fontSize: 17, minWidth: 44, textAlign: 'center' },
});
