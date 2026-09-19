import { StyleSheet, View } from 'react-native';
import { ListSeparator } from './list-separator';
import { useTheme } from '../theme';

/**
 * One row of a grouped card, when the card cannot wrap its rows.
 *
 * ## WHY THIS EXISTS AT ALL
 *
 * Every list in this application draws a card and puts its rows inside it: one
 * `View` with a surface, a border, a radius and a shadow, wrapping a `map`.
 * That shape stops working the moment a list is VIRTUALISED, because the rows
 * are no longer all there — a `FlatList` mounts a window of them and the card
 * would have to be the scroll container itself, which is where the search field
 * and the filters live.
 *
 * So the card is rebuilt from its rows: each one paints the surface and the two
 * side edges, the first one rounds and closes the top, the last one rounds and
 * closes the bottom. The result is the same box, drawn by its contents.
 *
 * ## THE EDGES ARE PER ROW, WHICH IS WHY `last` IS A PROP
 *
 * A virtualised list knows its length even when it has not drawn it, so the
 * caller can always say which row is last. It is passed rather than derived
 * because this component can never know: it sees one row.
 *
 * ## THE SEPARATOR IS INSIDE, NOT `ItemSeparatorComponent`
 *
 * A FlatList draws its separators BETWEEN items, so they are siblings of the
 * rows rather than children — and a sibling does not carry the side edges these
 * rows paint. The card would have a gap in both of its vertical borders at
 * every single separator. Drawn inside the row it separates, the edges are
 * continuous and the result is the box the old `map` produced.
 *
 * ## NO SHADOW
 *
 * A shadow is drawn OUTSIDE a view's bounds (slice 3), so one per row would
 * stack along every separator into a grey seam. The card look survives without
 * it; the seam would not survive at all.
 */
export function CardRow({
  first,
  last,
  children,
}: {
  first: boolean;
  last: boolean;
  children: React.ReactNode;
}) {
  const theme = useTheme();

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: theme.colors.surface,
          borderColor: theme.colors.border,
          borderTopWidth: first ? StyleSheet.hairlineWidth : 0,
          borderBottomWidth: last ? StyleSheet.hairlineWidth : 0,
          borderTopLeftRadius: first ? theme.radius.lg : 0,
          borderTopRightRadius: first ? theme.radius.lg : 0,
          borderBottomLeftRadius: last ? theme.radius.lg : 0,
          borderBottomRightRadius: last ? theme.radius.lg : 0,
        },
      ]}
    >
      {first ? null : <ListSeparator />}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
});
