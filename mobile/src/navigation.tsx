import type { BottomTabBarProps } from '@react-navigation/bottom-tabs';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import {
  createNavigationContainerRef,
  type LinkingOptions,
  type NavigatorScreenParams,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import * as Linking from 'expo-linking';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, Platform, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { layoutForWidth } from './layout';
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
  Settings: undefined;
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
      Settings: 'settings',
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
  const layout = layoutForWidth(useWindowDimensions().width);
  const verticalNav = layout.mode === 'desktop';
  const [navPreview,setNavPreview] = useState<number|null>(null);
  const navSize = useRef({width:300,height:240});
  const [navMeasured,setNavMeasured]=useState({width:300,height:240});
  const navPosition=useRef(new Animated.Value(0)).current;
  const [reduceMotion,setReduceMotion]=useState(false);
  useEffect(()=>{void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);const listener=AccessibilityInfo.addEventListener('reduceMotionChanged',setReduceMotion);return()=>listener.remove();},[]);
  const navStart = useRef(0);
  const suppressNavClick = useRef(0);
  const insets = useSafeAreaInsets();

  const tabs = state.routes.map(route => ({ id: route.name, key: route.key, label: descriptors[route.key].options.title ?? route.name }));
  const tab = state.routes[state.index].name;
  const selectTab = (index:number) => {
    const item=tabs[index];if(!item)return;
    const event = navigation.emit({ type: 'tabPress', target: item.key, canPreventDefault: true });
    if (!event.defaultPrevented && state.index !== index) navigation.navigate(item.id);
  };
  const navLatest = useRef({index:0,select:selectTab});
  navLatest.current={index:Math.max(0,tabs.findIndex(item=>item.id===tab)),select:selectTab};
  const settleNav=(index:number)=>{
    navPosition.stopAnimation();
    if(reduceMotion){navPosition.setValue(index);return;}
    Animated.spring(navPosition,{toValue:index,damping:24,stiffness:260,mass:0.8,overshootClamping:true,useNativeDriver:true}).start();
  };
  useEffect(()=>{settleNav(navLatest.current.index);},[tab,verticalNav,reduceMotion]);
  // Vertical items have fixed height; do not derive their pitch from a stale
  // measurement left over from the horizontal layout or an admin session.
  const navPitch=verticalNav?68:(navMeasured.width-10)/tabs.length;
  const navTranslation=useMemo(()=>navPosition.interpolate({inputRange:[0,tabs.length-1],outputRange:[0,navPitch*(tabs.length-1)],extrapolate:'clamp'}),[navPosition,navPitch,tabs.length]);
  const navGesture = useMemo(()=>{
    const position=(dx:number,dy:number)=>Math.max(0,Math.min(tabs.length-1,navStart.current+(verticalNav?dy:dx)/(verticalNav?68:(navSize.current.width-10)/tabs.length)));
    return PanResponder.create({
      onMoveShouldSetPanResponderCapture:(_,g)=>Math.abs(verticalNav?g.dy:g.dx)>8&&Math.abs(verticalNav?g.dy:g.dx)>Math.abs(verticalNav?g.dx:g.dy),
      onPanResponderGrant:()=>{navStart.current=navLatest.current.index;navPosition.stopAnimation();setNavPreview(navStart.current);},
      onPanResponderMove:(_,g)=>{const value=position(g.dx,g.dy);navPosition.setValue(value);setNavPreview(Math.round(value));},
      onPanResponderRelease:(_,g)=>{const index=Math.round(position(g.dx,g.dy));suppressNavClick.current=Date.now()+350;setNavPreview(null);settleNav(index);navLatest.current.select(index);},
      onPanResponderTerminate:()=>{suppressNavClick.current=Date.now()+350;setNavPreview(null);settleNav(navLatest.current.index);},
    });
  },[verticalNav,tabs.length,reduceMotion]);


  return (      <View testID="page-navigation" {...navGesture.panHandlers} onLayout={e=>{navSize.current=e.nativeEvent.layout;setNavMeasured(e.nativeEvent.layout);}} style={verticalNav ? [styles.sideBar,{top:insets.top+12}] : [styles.tabBar,layout.mode==='tablet'&&{left:16,right:undefined,width:Math.min(360,tabs.length*84+24)}, { bottom: Math.max(12, insets.bottom + 6) }]}>
        <Animated.View testID="navigation-highlight" pointerEvents="none" style={{position:'absolute',left:6,top:6,width:verticalNav?66:navPitch-4,height:verticalNav?64:50,borderRadius:25,backgroundColor:colors.mint,transform:verticalNav?[{translateY:navTranslation}]:[{translateX:navTranslation}]}} />
        {tabs.map((item,index) => {
          const active = navPreview===null ? tab === item.id : navPreview===index;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={item.id}
              accessibilityLabel={item.label}
              onLongPress={() => navigation.emit({ type: 'tabLongPress', target: item.key })}
              onPress={() => { if(Date.now()>=suppressNavClick.current)selectTab(index); }}
              style={({ pressed }) => [verticalNav ? styles.sideTab : styles.tab, pressed && { opacity: 0.7 }]}
            >
              <TabIcon route={item.id as keyof AppTabParamList} active={active} />
              <Text style={[styles.tabLabel, active && styles.tabActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
);
}

const styles = StyleSheet.create({
  sideBar: {overflow:'hidden',...(Platform.OS==='web'?{touchAction:'none' as const}:{}),position:'absolute',left:12,width:80,maxWidth:80,backgroundColor:'rgba(255,255,255,0.94)',borderWidth:1,borderColor:colors.line,padding:6,gap:4,borderRadius:32,shadowColor:'#183A35',shadowOpacity:0.14,shadowRadius:14,shadowOffset:{width:0,height:4},elevation:8},
  sideTab: {height:64,alignItems:'center',justifyContent:'center',gap:4,borderRadius:25},
  accountBar: { flexDirection: 'row', padding: 12, gap: 12, borderBottomWidth: 1, borderColor: colors.line },
  accountText: { flex: 1, color: colors.inkMuted, fontSize: 12 },
  tabBar: {
    ...(Platform.OS==='web'?{touchAction:'none' as const}:{}),
    position: 'absolute', left: 24, right: 24, height: 64,
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 32,
    borderColor: 'rgba(220,229,225,0.7)', borderWidth: 1,
    shadowColor: '#183A35', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8,
    flexDirection: 'row',
    padding: 6,
    gap: 4,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { color: '#7B8C89', fontSize: 25, lineHeight: 27 },
  tabLabel: { color: '#7B8C89', fontSize: 11, fontWeight: '800', marginTop: 2 },
  tabActive: { color: colors.orange },
});
