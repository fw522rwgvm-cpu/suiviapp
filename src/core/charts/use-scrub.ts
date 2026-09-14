import { useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { BandGeometry } from './scale';

/**
 * Reading a chart by touch, and by dragging (D13, specs 10.6).
 *
 * > Une seule interaction : toucher un point affiche sa valeur et sa date.
 *
 * Made continuous in slice 7 — dragging neither zooms nor pans, so it is the
 * same interaction read without lifting a finger ninety times. It lives here
 * at its second real user: the calories chart and the macro chart read exactly
 * the same way, and two copies of a gesture are two chances for two charts of
 * one screen to answer a touch differently.
 *
 * A Pan rather than a Pressable, because a Pressable cannot follow a finger:
 *  - onBegin selects at the touch, before any movement, so a plain tap still
 *    reads as it always did;
 *  - onUpdate follows;
 *  - onFinalize clears, INCLUDING when another recogniser takes the gesture
 *    away — which is what a vertical scroll does.
 *
 * activeOffsetX is what keeps the page scrollable. Without it a vertical drag
 * starting on a chart would be claimed here and the screen would stop
 * scrolling over its own graphs. The cost, accepted: beginning a scroll on a
 * chart flashes a readout for an instant before the ScrollView wins.
 *
 * runOnJS because the readout is React state and a formatted date — it has to
 * cross to the JS thread whatever happens, so there is nothing to gain by
 * hopping through a shared value first.
 */
export function useScrub(band: BandGeometry) {
  const [touched, setTouched] = useState<number | null>(null);

  const gesture = Gesture.Pan()
    .activeOffsetX([-8, 8])
    .runOnJS(true)
    .onBegin((event) => setTouched(band.indexAt(event.x)))
    .onUpdate((event) => setTouched(band.indexAt(event.x)))
    .onFinalize(() => setTouched(null));

  return { touched, gesture };
}
