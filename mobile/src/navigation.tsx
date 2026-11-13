import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNavigationContainerRef,
  type LinkingOptions,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Svg, { Circle, Path } from 'react-native-svg';

import { colors } from './theme';

/** Typed route definitions, deep-link mapping, and the custom bottom navigation bar. */

export type AppTabParamList = {
  Feed: undefined;
  Map: undefined;
  Saved: undefined;
  Admin: undefined;
};

export type RootStackParamList = {
  Main: NavigatorScreenParams<AppTabParamList> | undefined;
  EventDetail: { eventId: string };
};

export const AppTabs = createBottomTabNavigator<AppTabParamList>();
export const RootStack = createNativeStackNavigator<RootStackParamList>();
export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export const linking: LinkingOptions<RootStackParamList> = {
  prefixes: [Linking.createURL('/'), 'citypulse://'],
  config: {
    screens: {
      Main: {
        screens: {
          Feed: 'feed',
          Map: 'map',
          Saved: 'saved',
          Admin: 'admin',
        },
      },
      EventDetail: 'event/:eventId',
    },
  },
};

/** Draws the icon for `route`; `active` selects its highlighted color. */
function TabIcon({ route, active }: { route: keyof AppTabParamList; active: boolean }) {
  const stroke = active ? colors.orange : '#7B8C89';
  return <Svg width={24} height={24} viewBox="0 0 24 24" stroke={stroke} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round">
    {route === 'Saved' ? <><Circle cx={12} cy={7} r={4}/><Path d="M4 22v-3a8 8 0 0 1 16 0v3"/></> :
      route === 'Map' ? <><Circle cx={12} cy={12} r={9}/><Path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></> :
        route === 'Admin' ? <><Path d="M12 3 5 6v5c0 5 3 8 7 10 4-2 7-5 7-10V6Z"/><Path d="m9 12 2 2 4-5"/></> :
          <><Path d="M4 3h6v8H4zM14 3h6v5h-6zM4 15h6v6H4zM14 12h6v9h-6z"/></>}
  </Svg>;
}

/** Renders tabs from navigator `state`, labels from `descriptors`, and actions via `navigation`. */
export function FloatingTabBar({ state, descriptors, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.tabBar, { bottom: Math.max(12, insets.bottom + 6) }]}>
    {state.routes.map((route, index) => {
      const active = state.index === index;
      const options = descriptors[route.key].options;
      const label = typeof options.tabBarLabel === 'string' ? options.tabBarLabel :
        typeof options.title === 'string' ? options.title : route.name;
      /** Emits the standard tab event and navigates unless a listener cancels it. */
      const press = () => {
        const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
        if (!active && !event.defaultPrevented) navigation.navigate(route.name, route.params);
      };
      return <Pressable
        accessibilityRole="button"
        accessibilityLabel={options.tabBarAccessibilityLabel ?? label}
        accessibilityState={{ selected: active }}
        key={route.key}
        onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
        onPress={press}
        style={({ pressed }) => [styles.tab, pressed && styles.pressed]}
      >
        <TabIcon route={route.name as keyof AppTabParamList} active={active} />
        <Text style={[styles.label, active && styles.active]}>{label}</Text>
      </Pressable>;
    })}
  </View>;
}

const styles = StyleSheet.create({
  tabBar: {
    position: 'absolute', left: 24, right: 24, height: 64,
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 32,
    borderColor: 'rgba(220,229,225,0.7)', borderWidth: 1,
    shadowColor: '#183A35', shadowOpacity: 0.14, shadowRadius: 18,
    shadowOffset: { width: 0, height: 6 }, elevation: 8,
    flexDirection: 'row', paddingHorizontal: 18,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  pressed: { opacity: 0.7 },
  label: { color: '#7B8C89', fontSize: 11, fontWeight: '800', marginTop: 2 },
  active: { color: colors.orange },
});
