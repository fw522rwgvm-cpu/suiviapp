import { SymbolView } from 'expo-symbols';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { parseDecimal } from '@/core/format';
import { fontFamilyFor, useTheme, type ThemePreference } from '@/core/theme';
import { KeypadAccessory } from '@/core/ui/keypad-accessory';
import { ListSeparator } from '@/core/ui/list-separator';
import { DataSection } from '@/features/backup/components/data-section';
import { PerfSection } from '../components/perf-section';
import { SearchDiagnosticSection } from '../components/search-diagnostic-section';
import { SeedSection } from '../components/seed-section';
import {
  usePreferences,
  useSetAdherenceTolerance,
  useSetCutoffHour,
  useSetTheme,
} from '../data/settings-queries';
import { normalizeAdherenceTolerance } from '../domain/preferences';
import { MAX_CUTOFF_HOUR, MIN_CUTOFF_HOUR } from '@/core/date';

/**
 * The Réglages tab (specs 8.8, 12).
 *
 * Sections in the order specs 12 tabulates them: Apparence, Affichage,
 * Nutrition, Données, À propos.
 *
 * ## WHAT IS NOT HERE, AND IT IS NOT AN OVERSIGHT
 *
 * Specs 8.8 and 12 both list "Unités et préférences d'affichage" for V1, and
 * there is nothing to put in it. The base units g and ml are sealed and belong
 * to a food, not to a preference (specs 5.1: no conversion, no density);
 * rounding is normative, one decimal on the macros and whole calories; the
 * language is French only (D10 rules out an internationalisation library).
 * Weight in kg is the first unit anyone could have an opinion about, and it
 * arrives in V2. Recorded in the specs rather than filled with an invented
 * setting.
 *
 * ## THE TWO CHOICES ARE ROWS WITH A TICK, NOT A PICKER
 *
 * Amendment 9.5 no 10 settled this for meal names after trying two native
 * controls: a UIPickerView costs a scroll for what could be a tap and eats a
 * hundred and fifty points, and an action sheet asks a second question —
 * Cancel — about a choice that already has an answer. Rows show the whole set
 * without touching anything, which is what makes "bounded between 0h and 6h"
 * VISIBLE rather than merely true.
 *
 * Both sections push nothing: browsing is a push, and neither of these is a
 * place. Only À propos is, because it is six rows of version numbers nobody
 * scrolls past three groups to reach.
 */

/** The three, in the order specs 8.8 writes them. */
const THEME_OPTIONS: readonly { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Clair' },
  { value: 'dark', label: 'Sombre' },
  { value: 'system', label: 'Système' },
];

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

function cutoffLabel(hour: number): string {
  return hour === 0 ? 'Minuit' : `${hour} h`;
}

export function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const preferences = usePreferences();
  const setTheme = useSetTheme();
  const setCutoffHour = useSetCutoffHour();

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.container}
      keyboardShouldPersistTaps="handled"
    >
      {/* NativeTabs provides no JS header, so the screen carries its own title. */}
      <Text style={[styles.screenTitle, { color: theme.colors.text }]}>Réglages</Text>

      <Section title="APPARENCE">
        <Card>
          {THEME_OPTIONS.map((option, index) => (
            <ChoiceRow
              key={option.value}
              label={option.label}
              selected={preferences.theme === option.value}
              first={index === 0}
              onPress={() => setTheme.mutate(option.value)}
            />
          ))}
        </Card>
      </Section>

      <Section title="AFFICHAGE">
        <Card>
          {CUTOFF_HOURS.map((hour, index) => (
            <ChoiceRow
              key={hour}
              label={cutoffLabel(hour)}
              selected={preferences.cutoffHour === hour}
              first={index === 0}
              onPress={() => setCutoffHour.mutate(hour)}
            />
          ))}
        </Card>
        <Note>
          Heure à laquelle la journée bascule. Avant elle, le Journal s’ouvre encore sur
          la veille. Ça ne change que la date proposée par défaut : rien de ce qui est
          déjà enregistré ne bouge, et une date se corrige en un geste.
        </Note>
      </Section>

      <Section title="NUTRITION">
        <Card>
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
        </Card>
        <Note>
          Marge tolérée sur chacune des quatre macros pour qu’une journée compte comme
          tenue. Une journée n’est dans la cible que si les quatre y sont.
        </Note>
      </Section>

      {/* The safety net comes first among the rest: it is the only one there
          is (specs 5.4). */}
      <DataSection />

      <Section title="À PROPOS">
        <Card>
          <LinkRow
            label="Version et schéma"
            first
            onPress={() => router.push('/(tabs)/settings/about')}
          />
        </Card>
      </Section>

      {/* Render nothing on the daily installation (D15). */}
      <PerfSection />
      <SearchDiagnosticSection />
      <SeedSection />
    </ScrollView>
  );
}

/**
 * The adherence tolerance (specs 8.7).
 *
 * A typed number rather than a short list of percentages, because specs 8.7
 * says "adjustable" and gives no list: offering four values would be inventing
 * a rule nobody wrote. The price is a keypad on a screen that otherwise has
 * none, which is what KeypadAccessory is for — iOS number pads have no return
 * key, so without it there is no way to say "done".
 *
 * ## APPLIED ON BLUR, LIKE THE QUANTITY FIELD
 *
 * Writing on every keystroke would store 1, then 15, then 150 — and the middle
 * ones are values the clamp would answer, so the row would flicker through
 * settings nobody chose. Blur is the moment the answer is finished.
 *
 * An unreadable entry falls back to the stored value rather than to a default:
 * clearing the field and tapping OK means "never mind", not "reset".
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
    // Through the same function the write uses, never a clamp spelled out
    // again here. Two readings of one rule are free to disagree, and the one
    // that would drift is the one the user is looking at.
    setText(String(normalizeAdherenceTolerance(parsed)));
  }

  return (
    <View>
      <ListSeparator />
      <View style={styles.row}>
        <Text style={[styles.label, { color: theme.colors.text, fontSize: 17 }]}>
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

/**
 * A caption and what it names, as siblings rather than a wrapper.
 *
 * A fragment, so the rows lay out in the screen's own flex gap — which is what
 * makes these groups spaced exactly like DataSection's, written before them and
 * built the same way. Wrapping them in a View would have given the group its
 * own inner spacing and left it sitting differently from its neighbour.
 */
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <>
      <Text style={[styles.sectionTitle, { color: theme.colors.textFaint }]}>{title}</Text>
      {children}
    </>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.card,
        { backgroundColor: theme.colors.surface, borderColor: theme.colors.border },
      ]}
    >
      {children}
    </View>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  return <Text style={[styles.note, { color: theme.colors.textMuted }]}>{children}</Text>;
}

/**
 * One option of a closed set.
 *
 * A tick, and nothing where there is no tick: a column of empty circles would
 * draw seven controls where there is one choice. `first` rather than a
 * separator between siblings, so a caller can map without wrapping each row in
 * a fragment that carries its own rule.
 */
function ChoiceRow({
  label,
  selected,
  first,
  onPress,
}: {
  label: string;
  selected: boolean;
  first?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View>
      {first === true ? null : <ListSeparator />}
      <Pressable
        onPress={onPress}
        accessibilityRole="radio"
        accessibilityState={{ selected }}
        style={styles.row}
      >
        <Text style={[styles.label, { color: theme.colors.text, fontSize: 17 }]}>
          {label}
        </Text>
        {selected ? (
          <SymbolView name="checkmark" size={15} tintColor={theme.colors.accent} />
        ) : null}
      </Pressable>
    </View>
  );
}

/** A row that goes somewhere, as against a row that states a fact. */
function LinkRow({
  label,
  first,
  onPress,
}: {
  label: string;
  first?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <View>
      {first === true ? null : <ListSeparator />}
      <Pressable onPress={onPress} accessibilityRole="button" style={styles.row}>
        <Text style={[styles.label, { color: theme.colors.text, fontSize: 17 }]}>
          {label}
        </Text>
        <SymbolView name="chevron.right" size={13} tintColor={theme.colors.textFaint} />
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Generous bottom padding: the tab bar is translucent now, and content is
  // meant to scroll under it rather than stop short of it.
  container: { padding: 16, paddingTop: 24, paddingBottom: 48, gap: 8 },
  screenTitle: { fontSize: 34, fontWeight: '700', marginBottom: 4 },
  // marginTop, not a wrapper: it is the air ABOVE a group, and it has to
  // match DataSection's, which is written the same way.
  sectionTitle: {
    fontSize: 12,
    fontWeight: '600',
    letterSpacing: 0.6,
    marginLeft: 4,
    marginTop: 16,
  },
  card: { borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, overflow: 'hidden' },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 16,
    paddingHorizontal: 14,
    // The system's own row height: below it a row stops being comfortable to
    // hit, above it a form starts to look like a list of cards.
    minHeight: 44,
    paddingVertical: 11,
  },
  label: { fontSize: 15 },
  field: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  // Right-aligned so the figure sits where every other row's value does, and
  // wide enough for three digits without the row shifting as they are typed.
  input: { fontSize: 17, minWidth: 44, textAlign: 'right' },
  unit: { fontSize: 15 },
  note: { fontSize: 13, lineHeight: 19, marginLeft: 4, marginRight: 4 },
});
