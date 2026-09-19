import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { usePathname, useRouter } from 'expo-router';
import { SymbolView } from 'expo-symbols';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { useActiveSession } from '../data/session-queries';
import { useLiveDuration } from '../hooks/use-live-duration';
import { durationText, progressText } from '../domain/session-text';

/**
 * The band that follows a live session everywhere (specs 10.3).
 *
 * > Bandeau persistant dans toute l'application, ramenant à la séance.
 *
 * ## IT IS ALSO THE RESUME PROMPT, AND THAT IS WHY THERE IS NO DIALOG
 *
 * Specs 10.3 asks for a resume "proposée à la réouverture, sans limite de
 * temps", and D12 adds that "aucune question supplémentaire n'est posée à la
 * reprise". Those two together describe exactly this: a session survives, the
 * band says so, and touching it goes back in. A dialog on launch would be a
 * question with one useful answer, asked before anybody has looked at the
 * screen — and it would have to be dismissed by everyone who opened the
 * application for something else.
 *
 * The segments are what let it ask nothing: the time away is already outside
 * every segment, so there is no gap to account for and nothing to correct.
 *
 * ## WHERE IT SITS, AND THE ONE NUMBER THAT IS A JUDGEMENT
 *
 * Above the tab bar, which is where iOS puts an ongoing activity — the Music
 * mini player, the in-call pill. The tab bar is a real UITabBarController
 * (NativeTabs), and `useBottomTabBarHeight` belongs to the JavaScript navigator
 * and throws here, so its height is not readable from this side.
 *
 * TAB_BAR_HEIGHT is therefore declared: 49 points, the height of a portrait
 * UITabBar since iOS 7. It is a PLATFORM constant rather than a guess about our
 * own content, which is the distinction slice 7's rule draws — "ne jamais
 * positionner depuis une taille supposée" was about a tooltip whose height
 * changed with its contents.
 *
 * RESERVE INSCRIBED, and the direction of the error is the reason this is
 * acceptable: on iOS 26 the bar MINIMISES as the page scrolls, so a fixed
 * offset leaves the band floating slightly high — a gap, not an overlap. Too
 * high reads as a floating control, which is what it is; too low would hide it
 * behind the bar. Nothing here can look at it, and one line changes it.
 */
export function SessionBanner() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const active = useActiveSession();

  const session = active.data ?? null;
  const liveMs = useLiveDuration(session?.segments ?? []);

  /**
   * Nothing for `undefined` AND nothing for `null`.
   *
   * "Not read yet" and "no session" must draw the same thing — nothing — and
   * folding one onto the other is the defect slice 4 paid for twice. Here the
   * cost of getting it wrong would be a band flashing on every cold start.
   */
  if (session === null) return null;

  // Not over the session itself: a band leading where you already are is a
  // control that cannot do anything.
  if (pathname.startsWith('/training/session')) return null;

  return (
    <View
      pointerEvents="box-none"
      style={[styles.dock, { bottom: insets.bottom + TAB_BAR_HEIGHT + BAR_GAP }]}
    >
      <Pressable
        onPress={() => router.push('/(tabs)/training/session')}
        accessibilityRole="button"
        accessibilityLabel={`Séance en cours, ${durationText(liveMs)}, ${progressText(
          session.doneSets,
          session.totalSets,
        )} séries. Reprendre.`}
        style={({ pressed }) => [
          styles.band,
          {
            backgroundColor: theme.colors.accent,
            borderRadius: theme.radius.lg,
            opacity: pressed ? 0.85 : 1,
          },
          theme.shadow,
        ]}
      >
        <SymbolView
          name="figure.strengthtraining.traditional"
          tintColor={theme.colors.onAccent}
          size={18}
          fallback={<Text style={{ color: theme.colors.onAccent }}>●</Text>}
        />
        <View style={styles.texts}>
          <Text numberOfLines={1} style={[styles.title, { color: theme.colors.onAccent }]}>
            {session.routineName ?? 'Séance en cours'}
          </Text>
          {/*
            The two figures of the upper band, in the same order and the same
            words: somebody glancing at this must not have to re-learn them when
            they open the session.
          */}
          <Text numberOfLines={1} style={[styles.detail, { color: theme.colors.onAccent }]}>
            {durationText(liveMs)} · {progressText(session.doneSets, session.totalSets)} séries
          </Text>
        </View>
        <Text style={[styles.action, { color: theme.colors.onAccent }]}>Reprendre</Text>
      </Pressable>
    </View>
  );
}

/**
 * The height of a portrait UITabBar, unchanged since iOS 7.
 *
 * Declared rather than measured because NativeTabs is a UITabBarController and
 * does not publish its height to JavaScript. See the note above for why the
 * error, if there is one, points the harmless way.
 */
const TAB_BAR_HEIGHT = 49;

/**
 * The air between the band and the tab bar (specs 14.38).
 *
 * It sat flush on top of it, which read as one two-storey control rather than
 * as something floating above the chrome — and floating is the whole metaphor
 * iOS uses here, the Music mini player and the in-call pill both stand clear.
 * Eight points, the same gap the cards of this application keep from each
 * other.
 */
const BAR_GAP = 8;

const styles = StyleSheet.create({
  dock: { position: 'absolute', left: 0, right: 0, paddingHorizontal: 12 },
  band: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    minHeight: 52,
  },
  texts: { flex: 1, gap: 1 },
  title: { fontSize: 15, fontWeight: '600' },
  detail: { fontSize: 12, fontVariant: ['tabular-nums'], opacity: 0.9 },
  action: { fontSize: 15, fontWeight: '600' },
});
