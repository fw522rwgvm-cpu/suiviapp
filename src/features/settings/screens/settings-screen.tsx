import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '@/core/theme';
import { LinkRow, SettingsCard, SettingsSection } from '@/core/ui/settings-list';
import { Text } from '@/core/ui/text';
import { useExportFreshness } from '@/features/backup/data/backup-queries';
import { shortAge } from '@/features/backup/domain/export-age';
import { useNotificationSettings } from '@/features/notifications/data/notification-queries';
import { PerfSection } from '../components/perf-section';
import { SearchDiagnosticSection } from '../components/search-diagnostic-section';
import { SeedSection } from '../components/seed-section';
import { usePreferences } from '../data/settings-queries';
import { themeLabel } from './appearance-screen';
import { cutoffLabel } from './display-screen';

/**
 * The Réglages tab (specs 8.8, 12).
 *
 * ## A PAGE PER CATEGORY, AND THE INDEX IS A LIST OF DESTINATIONS
 *
 * It was one long scroll holding every setting the application has, which
 * worked while there were three. Slice 9 added a seventh category and the
 * screen became something you scroll THROUGH to reach what you came for — and
 * specs 12 tabulates the settings by category in the first place.
 *
 * So the index lists where to go and each category owns its page. That is the
 * arrangement iOS itself uses, and it buys two things beyond the scrolling: a
 * category gets room for the note that explains it, and a control that needs
 * space — a picker wheel, a keypad — stops being wedged between two unrelated
 * rows on a page that scrolls under a transparent header.
 *
 * ## EACH ROW SAYS ITS OWN ANSWER
 *
 * A list of links with nothing on the right is a table of contents: you open a
 * page to find out what it says. The theme, the cutoff hour, how many reminders
 * are on and how old the last export is are each one short string, so putting
 * them on the row means the common case — checking — costs no navigation at
 * all.
 *
 * The groups are not specs 12's table read out. That table is an inventory;
 * this is a running order, and it puts what changes the look first, what the
 * application tracks second, and what it keeps about itself last. Same
 * reasoning that moved POIDS out of its tabulated position in slice 8.
 *
 * Route wiring stays in app/ (D10); this decides what the list contains.
 */
export function SettingsScreen() {
  const theme = useTheme();
  const router = useRouter();
  const preferences = usePreferences();
  const notifications = useNotificationSettings();
  const freshness = useExportFreshness();

  const enabledCount = notifications.filter((setting) => setting.enabled).length;

  return (
    <ScrollView
      style={{ backgroundColor: theme.colors.background }}
      contentContainerStyle={styles.container}
    >
      {/* NativeTabs provides no JS header, so the screen carries its own title. */}
      <Text style={[styles.screenTitle, { color: theme.colors.text }]}>Réglages</Text>

      <SettingsSection title="AFFICHAGE">
        <SettingsCard>
          <LinkRow
            label="Apparence"
            value={themeLabel(preferences.theme)}
            first
            onPress={() => router.push('/(tabs)/settings/appearance')}
          />
          <LinkRow
            label="Heure de bascule"
            value={cutoffLabel(preferences.cutoffHour)}
            onPress={() => router.push('/(tabs)/settings/display')}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="SUIVI">
        <SettingsCard>
          <LinkRow
            label="Nutrition"
            first
            onPress={() => router.push('/(tabs)/settings/nutrition')}
          />
          <LinkRow
            label="Objectif de poids"
            onPress={() => router.push('/(tabs)/settings/weight-goal')}
          />
          {/*
            Under the weight goal and above the notifications, which is where
            specs 12 puts it in its own table: Nutrition, Poids, Musculation.
            The sections of this screen follow that order rather than the order
            the slices happened to land in.
          */}
          <LinkRow
            label="Musculation"
            onPress={() => router.push('/(tabs)/settings/strength')}
          />
          <LinkRow
            label="Notifications"
            // The count rather than the names: four would not fit, and "Aucune"
            // is the one answer worth seeing without opening anything — it is
            // what a reminder that never came looks like from here.
            value={enabledCount === 0 ? 'Aucune' : `${enabledCount} sur 4`}
            onPress={() => router.push('/(tabs)/settings/notifications')}
          />
        </SettingsCard>
      </SettingsSection>

      <SettingsSection title="APPLICATION">
        <SettingsCard>
          <LinkRow
            label="Données"
            // The age of the last export, on the row, because specs 5.4 makes
            // it the one figure that must never reassure wrongly. Behind a push
            // it would be a figure nobody sees; here it is the reason to open
            // the page. Through the same function the page itself uses.
            value={shortAge(freshness.data)}
            first
            onPress={() => router.push('/(tabs)/settings/data')}
          />
          <LinkRow label="À propos" onPress={() => router.push('/(tabs)/settings/about')} />
        </SettingsCard>
      </SettingsSection>

      {/* Render nothing on the daily installation (D15). */}
      <PerfSection />
      <SearchDiagnosticSection />
      <SeedSection />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  // The tab bar is glass and the content is meant to scroll under it rather
  // than stop short of it.
  container: { padding: 16, paddingTop: 24, paddingBottom: 48, gap: 8 },
  screenTitle: { fontSize: 34, fontWeight: '700', marginBottom: 4 },
});
