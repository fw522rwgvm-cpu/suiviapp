import { isLiquidGlassAvailable } from 'expo-glass-effect';
import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useTheme } from '@/core/theme';
import { useRequestToday } from '@/features/nutrition/hooks/requested-date';

/**
 * Four fixed tabs, identical from V1 to V4 (specs 7).
 *
 * NativeTabs wraps a real UITabBarController rather than drawing a bar in
 * JavaScript. That is the whole point: Liquid Glass is a treatment UIKit
 * applies to its own controls, so a bar painted in JS can never receive it,
 * however it is styled. Since CI builds against the iOS 26 SDK, the system bar
 * adopts the new design on its own, with nothing to switch on.
 *
 * Consequences accepted:
 *  - the background is deliberately NOT set. Painting it would make the bar
 *    opaque and defeat the effect: the system owns that surface now.
 *  - there is no JS header any more. Screens carry their own titles until a
 *    tab actually needs to navigate somewhere (specs 7 puts a library icon in
 *    the Journal header, which arrives with slice 1).
 *  - the module is published as unstable. Its API may move between SDKs, and
 *    each check costs a CI cycle, which is the price D1 announces for native.
 *
 * Route wiring only: names, labels, icons. No logic, no queries (D10).
 */
export default function TabsLayout() {
  const theme = useTheme();
  const requestToday = useRequestToday();

  return (
    <NativeTabs
      tintColor={theme.colors.accent}
      // Shrinks the bar to a pill as content scrolls down: an iOS 26 behaviour,
      // so it is only asked for when the system can honour it.
      {...(isLiquidGlassAvailable() ? { minimizeBehavior: 'onScrollDown' as const } : {})}
    >
      {/*
        (journal) is a group, so it adds no path segment: this stays the index
        route of the tabs group. It exists to give the Journal a native stack,
        and therefore a system header carrying the date and the day navigation
        of specs 8.3.
      */}
      {/*
        PRESSING IT RETURNS TO TODAY (specs 14.24).

        Through the same request the calendar uses, rather than a second way of
        telling the Journal which day to show: the carousel keeps owning the
        date, nothing is stored, and the request is consumed once.

        On EVERY press, not only when the tab is already focused. The focused-
        only form is the iOS idiom and would have matched the request exactly,
        but it turns on navigation.isFocused() inside an unstable API this
        machine cannot exercise — and its failure mode is silence, a feature
        that simply never happens. Consequence accepted and stated: coming back
        from another tab also lands on today, which is what specs 7 asks of a
        launch and one swipe away from wherever you were.
      */}
      <NativeTabs.Trigger name="(journal)" listeners={{ tabPress: () => requestToday() }}>
        <NativeTabs.Trigger.Icon sf="fork.knife" />
        <NativeTabs.Trigger.Label>Journal</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="training">
        <NativeTabs.Trigger.Icon sf="figure.strengthtraining.traditional" />
        <NativeTabs.Trigger.Label>Entraînement</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="stats">
        <NativeTabs.Trigger.Icon sf="chart.xyaxis.line" />
        <NativeTabs.Trigger.Label>Stats</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>

      {/*
        A real directory rather than a group, unlike (journal) — and the
        difference is the whole reason (journal) has parentheses. The Journal
        MUST stay the tabs group's index route, so its folder may not add a
        path segment. The Settings must not be that index, so its folder is
        free to be a plain one: app/(tabs)/settings/index.tsx is /settings, and
        a second parenthesised group here would have claimed / for a second
        time.
      */}
      <NativeTabs.Trigger name="settings">
        <NativeTabs.Trigger.Icon sf="gearshape" />
        <NativeTabs.Trigger.Label>Réglages</NativeTabs.Trigger.Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
