import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, TextInput, View } from 'react-native';
import { parseDecimal } from '@/core/format';
import { fontFamilyFor, useTheme } from '@/core/theme';
import { KeypadAccessory } from '@/core/ui/keypad-accessory';
import { ListSeparator } from '@/core/ui/list-separator';
import {
  LinkRow,
  SettingsCard,
  SettingsNote,
  SettingsPage,
  settingsStyles,
} from '@/core/ui/settings-list';
import { Text } from '@/core/ui/text';
import { usePreferences, useSetAdherenceTolerance } from '../data/settings-queries';
import { normalizeAdherenceTolerance } from '../domain/preferences';

/**
 * Nutrition — templates, planning and the adherence tolerance (specs 8.1, 8.7, 12).
 */
export function NutritionSettingsScreen() {
  const router = useRouter();

  return (
    <SettingsPage>
      <SettingsCard>
        <LinkRow
          label="Modèles de journée"
          first
          onPress={() => router.push('/(tabs)/settings/templates')}
        />
        <LinkRow
          label="Planning et modèle par défaut"
          onPress={() => router.push('/(tabs)/settings/planning')}
        />
        <ToleranceRow />
      </SettingsCard>
      <SettingsNote>
        Marge tolérée sur chacune des quatre macros pour qu’une journée compte comme
        tenue. Une journée n’est dans la cible que si les quatre y sont.
      </SettingsNote>
    </SettingsPage>
  );
}

/**
 * The adherence tolerance (specs 8.7).
 *
 * A typed number rather than a short list of percentages, because specs 8.7
 * says "adjustable" and gives no list: offering four values would be inventing
 * a rule nobody wrote. The price is a keypad on a page that otherwise has none,
 * which is what KeypadAccessory is for — iOS number pads have no return key, so
 * without it there is no way to say "done".
 *
 * APPLIED ON BLUR, like the quantity field. Moved here verbatim when the
 * Settings became a page per category: it is the same control, on the page its
 * subject lives on.
 */
function ToleranceRow() {
  const theme = useTheme();
  const preferences = usePreferences();
  const setTolerance = useSetAdherenceTolerance();
  const [text, setText] = useState(String(preferences.adherenceTolerancePct));

  function apply(): void {
    const parsed = parseDecimal(text);
    if (parsed === null) {
      setText(String(preferences.adherenceTolerancePct));
      return;
    }
    setTolerance.mutate(parsed);
    // Shows what will actually be STORED, clamp included, rather than what was
    // typed: a setting must never read back as something other than its value.
    //
    // Through the same function the write uses, never a clamp spelled out again
    // here. Two readings of one rule are free to disagree, and the one that
    // would drift is the one the user is looking at.
    setText(String(normalizeAdherenceTolerance(parsed)));
  }

  return (
    <View>
      <ListSeparator />
      <View style={settingsStyles.row}>
        <Text style={[settingsStyles.label, { color: theme.colors.text, fontSize: 17 }]}>
          Tolérance d’adhérence
        </Text>
        <View style={styles.field}>
          <KeypadAccessory label="Valider la tolérance">
            {(accessoryId) => (
              <TextInput
                value={text}
                onChangeText={setText}
                onBlur={apply}
                selectTextOnFocus
                keyboardType="number-pad"
                inputAccessoryViewID={accessoryId}
                accessibilityLabel="Tolérance d’adhérence, en pourcent"
                style={[
                  styles.input,
                  {
                    color: theme.colors.text,
                    fontFamily: fontFamilyFor('normal', theme.fontsLoaded),
                  },
                ]}
              />
            )}
          </KeypadAccessory>
          <Text style={[styles.unit, { color: theme.colors.textMuted }]}>%</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Right-aligned so the figure sits where every other row's value does, and
  // wide enough for three digits without the row shifting as they are typed.
  input: { fontSize: 17, minWidth: 44, textAlign: 'right' },
  unit: { fontSize: 15 },
});
