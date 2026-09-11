import { SymbolView } from 'expo-symbols';
import type { SFSymbol } from 'expo-symbols';
import { Tabs } from 'expo-router/js-tabs';
import type { ColorValue } from 'react-native';
import { useTheme } from '@/core/theme';

// Four fixed tabs, identical from V1 to V4 (specs 7).
// Route wiring only: titles, icons and screen options. No logic, no queries.
export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: theme.colors.accent,
        tabBarInactiveTintColor: theme.colors.textFaint,
        tabBarStyle: {
          backgroundColor: theme.colors.surface,
          borderTopColor: theme.colors.border,
        },
        headerStyle: { backgroundColor: theme.colors.surface },
        headerTitleStyle: { color: theme.colors.text },
        headerShadowVisible: false,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'Journal', tabBarIcon: icon('fork.knife') }}
      />
      <Tabs.Screen
        name="training"
        options={{
          title: 'Entraînement',
          tabBarIcon: icon('figure.strengthtraining.traditional'),
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{ title: 'Stats', tabBarIcon: icon('chart.xyaxis.line') }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'Réglages', tabBarIcon: icon('gearshape') }}
      />
    </Tabs>
  );
}

function icon(symbol: SFSymbol) {
  // React Navigation hands the tint down as a ColorValue, which is not always a
  // string: it can be an opaque platform colour. SymbolView takes it as is.
  return function TabIcon({ color, size }: { color: ColorValue; size: number }) {
    return <SymbolView name={symbol} size={size} tintColor={color} weight="regular" />;
  };
}
