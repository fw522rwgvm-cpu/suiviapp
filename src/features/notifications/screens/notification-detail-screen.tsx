import { useState } from 'react';
import { Pressable, StyleSheet, Switch, View } from 'react-native';
import { useTheme } from '@/core/theme';
import {
  SettingsCard,
  SettingsNote,
  SettingsPage,
  settingsStyles,
} from '@/core/ui/settings-list';
import { ListSeparator } from '@/core/ui/list-separator';
import { Text } from '@/core/ui/text';
import {
  MAX_EXPORT_REMINDER_DAYS,
  MIN_EXPORT_REMINDER_DAYS,
} from '@/features/settings/data/settings-reads';
import { PermissionBanner } from '../components/permission-banner';
import { TimeWheel } from '../components/time-wheel';
import {
  useExportReminderDays,
  useNotificationSettings,
  useSetExportReminderDays,
  useSetNotificationEnabled,
  useSetNotificationTime,
} from '../data/notification-queries';
import {
  NOTIFICATION_DESCRIPTIONS,
  NOTIFICATION_LABELS,
  type NotificationKind,
  type NotificationTime,
} from '../domain/kinds';
import { useNotificationPermission } from '../hooks/use-notification-permission';

/**
 * One notification: on or off, and at what time (specs 9.3, 12).
 *
 * ## THE WHEEL IS DRIVEN BY LOCAL STATE, NEVER BY WHAT IS IN THE DATABASE
 *
 * This is the fix for a defect seen on the device, and it is the same lesson
 * the quantity wheels taught in slice 4 arriving from a different direction.
 *
 * The first version fed the picker straight from the query: `value` came from
 * notification_setting and `onChange` wrote to it. Turning the wheel then did
 * this — the wheel moves, onChange writes, and React re-renders with the OLD
 * value, because the write has to go through SQLite and the change bus groups
 * for 60 ms before invalidating. React Native dutifully commands the picker
 * back to the value it was given. A moment later the new value lands and the
 * wheel spins across to it on its own.
 *
 * Which is exactly what it looked like: it snapped back, then turned by itself
 * to the value that had been chosen.
 *
 * A UIPickerView is not a text field. It ANIMATES to whatever selectedValue it
 * is handed, so a controlled value that round-trips through a database cannot
 * drive one. The rule slice 4 wrote for the quantity screen — "the wheels stay
 * the single source of truth, what is typed lands ON them" — is the same rule:
 * the wheel owns the value while the screen is open, and the database is
 * written as a consequence.
 *
 * The initial value is taken ONCE, during the render that first has it, never
 * in an effect. An effect runs after its render has been painted, which is
 * precisely how the quantity wheels came to spin as they opened.
 */
export function NotificationDetailScreen({ kind }: { kind: NotificationKind }) {
  const theme = useTheme();
  const settings = useNotificationSettings();
  const setEnabled = useSetNotificationEnabled();
  const setTime = useSetNotificationTime();
  const { permission, request } = useNotificationPermission();

  const setting = settings.find((item) => item.kind === kind);

  /**
   * The wheel's value, owned here.
   *
   * Seeded during the render rather than in an effect, and only once: after
   * that the wheel is authoritative and a value flowing back from the database
   * — including one this very screen just wrote — must not reach it.
   */
  const [time, setTimeState] = useState<NotificationTime | null>(null);
  if (time === null && setting !== undefined) {
    setTimeState({ hour: setting.hour, minute: setting.minute });
  }

  if (setting === undefined || time === null) return <SettingsPage />;

  // Arrow constants rather than function declarations, so the narrowing above
  // reaches them: a hoisted `function` could in principle run before the guard,
  // and tsc says so.
  const toggle = async (enabled: boolean): Promise<void> => {
    // Stored first, so the choice survives whatever iOS answers — including a
    // prompt the user swipes away. A refusal never switches the row back: that
    // would make the screen lie about what was asked for, and would leave the
    // user with a control that undoes itself.
    setEnabled.mutate({ kind, enabled, time });
    if (enabled && permission !== 'granted') await request();
  };

  const moveWheel = (next: NotificationTime): void => {
    // Local first and in the same render, so the picker never sees a value
    // other than where the finger left it.
    setTimeState(next);
    setTime.mutate({ kind, time: next });
  };

  return (
    <SettingsPage>
      <PermissionBanner permission={permission} />

      <SettingsCard>
        <View style={settingsStyles.row}>
          <Text style={[settingsStyles.label, { color: theme.colors.text, fontSize: 17 }]}>
            Activer
          </Text>
          <Switch
            value={setting.enabled}
            onValueChange={(next) => void toggle(next)}
            accessibilityLabel={NOTIFICATION_LABELS[kind]}
          />
        </View>
      </SettingsCard>

      <SettingsNote>{NOTIFICATION_DESCRIPTIONS[kind]}</SettingsNote>

      {setting.enabled ? (
        <>
          <SettingsCard>
            <View style={settingsStyles.row}>
              <Text style={[settingsStyles.label, { color: theme.colors.text, fontSize: 17 }]}>
                Heure
              </Text>
              <Text style={{ color: theme.colors.textMuted, fontSize: 17 }}>
                {String(time.hour).padStart(2, '0')}:{String(time.minute).padStart(2, '0')}
              </Text>
            </View>
            <ListSeparator />
            <TimeWheel value={time} onChange={moveWheel} />
          </SettingsCard>

          {kind === 'export_reminder' ? <ExportDelayCard /> : null}
        </>
      ) : null}
    </SettingsPage>
  );
}

/**
 * How old the last export may get before this fires (specs 5.4, 9.3).
 *
 * Its own card under the hour, and only while the reminder is on: the delay
 * decides when this notification fires and means nothing without it.
 */
function ExportDelayCard() {
  const theme = useTheme();
  const days = useExportReminderDays();
  const setDays = useSetExportReminderDays();

  return (
    <>
      <SettingsCard>
        <View style={settingsStyles.row}>
          <Text style={[settingsStyles.label, { color: theme.colors.text, fontSize: 17 }]}>
            Délai
          </Text>
          <View style={styles.stepper}>
            <Step
              glyph="−"
              label="Un jour de moins"
              disabled={days <= MIN_EXPORT_REMINDER_DAYS}
              onPress={() => setDays.mutate(days - 1)}
            />
            <Text style={[styles.stepperValue, { color: theme.colors.text }]}>
              {days} j
            </Text>
            <Step
              glyph="+"
              label="Un jour de plus"
              disabled={days >= MAX_EXPORT_REMINDER_DAYS}
              onPress={() => setDays.mutate(days + 1)}
            />
          </View>
        </View>
      </SettingsCard>
      <SettingsNote>
        Sept jours par défaut, pour coïncider avec le cycle du certificat SideStore. Vos
        données n’existent que sur ce téléphone.
      </SettingsNote>
    </>
  );
}

function Step({
  glyph,
  label,
  disabled,
  onPress,
}: {
  glyph: string;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      style={styles.stepperButton}
    >
      <Text
        style={[
          styles.stepperGlyph,
          { color: disabled ? theme.colors.textFaint : theme.colors.accent },
        ]}
      >
        {glyph}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  // 44 points, Apple's minimum touch target — the size slice 8 settled on for
  // the weight card's own two buttons, and for the same reason: these are the
  // only thing in the row anyone aims at.
  stepperButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  stepperGlyph: { fontSize: 22 },
  // Fixed, so the row does not shift as the figure goes from one digit to two.
  stepperValue: { fontSize: 17, minWidth: 44, textAlign: 'center' },
});
