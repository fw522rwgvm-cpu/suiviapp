import { StyleSheet, View } from 'react-native';
import { useTheme } from '@/core/theme';

/**
 * The hairline between two rows of a list.
 *
 * ## INSET ON BOTH SIDES, WHICH IS NOT WHAT THE SYSTEM DOES
 *
 * A system table inset its separators on the leading side only, so they run
 * into the trailing edge. That reads correctly against a full-width table; it
 * does not against the rounded cards this application is made of, where the
 * line then touches one edge and stops short of the other, and the asymmetry
 * is the first thing the eye finds.
 *
 * So it is inset equally, and the same amount everywhere. It was three
 * different amounts in five places before this existed -- 14, 16 and 18 --
 * which is what a style copied between files does over time.
 *
 * ## Where it goes
 *
 * BETWEEN rows and never around them: a line above the first or below the last
 * would box the list in, and the card it sits in already does that. So the
 * caller draws it before every row but the first, rather than after every row.
 *
 * And OUTSIDE anything that moves: in a list whose rows are swiped, a
 * separator placed inside the row travels with it under the finger.
 */
export function ListSeparator() {
  const theme = useTheme();
  return <View style={[styles.line, { backgroundColor: theme.colors.border }]} />;
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, marginHorizontal: 16 },
});
