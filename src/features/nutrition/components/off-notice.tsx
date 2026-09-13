import { SymbolView } from 'expo-symbols';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/core/ui/text';
import { useTheme } from '@/core/theme';
import { minutesUntil } from '../off/rate-limit';

/**
 * What the screen says when Open Food Facts could not answer.
 *
 * ## TWO REGISTERS, AND THE DIFFERENCE IS SPECIFIED
 *
 * > Offline behaviour: results from the personal database and the cache, with
 * > a DISCREET "hors ligne" BANNER. No blocking message, no interruption of
 * > the journey. (Specs 8.5)
 *
 * > Rate limiting: [...] an overrun reported by the server suspends remote
 * > calls for several minutes, with an EXPLICIT MESSAGE — the only case where
 * > the message is not discreet. (Specs 8.5, D11)
 *
 * So there are exactly two voices in this component, and which one is used is
 * not a matter of taste. Being offline is the user's circumstance and they can
 * see it for themselves; a server-side quota is something they cannot see, can
 * make worse by retrying, and which risks a ban by IP address. That one gets
 * to interrupt. Nothing else in the application does.
 *
 * ## WHEN IT APPEARS: ON A FAILED REQUEST, NEVER ON "NO NETWORK"
 *
 * There is no connectivity check anywhere, and that is three decisions at
 * once:
 *
 *  - detecting an absent network would need expo-network or netinfo, and
 *    neither is in section 5;
 *  - the answer would be wrong anyway. A phone on a café wifi with a captive
 *    portal reports itself connected and reaches nothing;
 *  - D11 puts the banner in its "Failures" paragraph — "silent fallback to
 *    local with a discreet banner" — so the document already ties it to a
 *    failure rather than to a state.
 *
 * Consequence, accepted: nothing is shown until something has actually been
 * asked for. Which is right. Before the first explicit search, the application
 * has no business claiming to know.
 */

export type OffNotice =
  | { kind: 'offline' }
  /** The server refused. The one message in the application that interrupts. */
  | { kind: 'throttled'; retryAtMs: number }
  /**
   * The server answered with something unusable.
   *
   * Shown in the discreet register but NEVER worded as "hors ligne": the phone
   * is demonstrably online — something answered — and a banner claiming
   * otherwise would send the user to check a connection that is fine. Observed
   * on two of this API's own endpoints, so this is a real state.
   */
  | { kind: 'badResponse' };

export function OffNoticeBanner({ notice, now }: { notice: OffNotice; now: number }) {
  const theme = useTheme();
  const loud = notice.kind === 'throttled';

  return (
    <View
      style={[
        styles.banner,
        {
          backgroundColor: loud ? theme.colors.surface : 'transparent',
          borderColor: loud ? theme.colors.border : 'transparent',
          borderRadius: theme.radius.lg,
        },
      ]}
    >
      <SymbolView
        name={loud ? 'clock.badge.exclamationmark' : 'wifi.slash'}
        size={loud ? 18 : 14}
        tintColor={loud ? theme.colors.text : theme.colors.textFaint}
      />
      <Text
        style={[
          loud ? styles.loud : styles.quiet,
          { color: loud ? theme.colors.text : theme.colors.textFaint },
        ]}
      >
        {describe(notice, now)}
      </Text>
    </View>
  );
}

function describe(notice: OffNotice, now: number): string {
  switch (notice.kind) {
    case 'offline':
      return 'Hors ligne — résultats de la bibliothèque et du cache.';
    case 'badResponse':
      // Not "hors ligne". Something answered.
      return 'Open Food Facts est indisponible — résultats locaux seulement.';
    case 'throttled': {
      const minutes = minutesUntil(notice.retryAtMs, now);
      return `Open Food Facts limite les requêtes. Nouvelle recherche possible dans ${minutes} ${
        minutes === 1 ? 'minute' : 'minutes'
      }.`;
    }
  }
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: StyleSheet.hairlineWidth,
  },
  quiet: { fontSize: 13, flexShrink: 1 },
  loud: { fontSize: 15, fontWeight: '500', flexShrink: 1, lineHeight: 20 },
});
