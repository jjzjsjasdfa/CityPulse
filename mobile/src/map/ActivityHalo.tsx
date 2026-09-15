import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, Platform, StyleSheet } from 'react-native';
import Svg, { Circle, Defs, RadialGradient, Stop } from 'react-native-svg';
import type { EventCategory } from '../api/types';
import { signalColors } from '../theme';
export const HALO_DURATION = 60000;
export function ActivityHalo({ id, category, until }: { id: string; category: EventCategory; until: number }) {
  const [expired, setExpired] = useState(() => until <= Date.now());
  useEffect(() => { setExpired(until <= Date.now()); const timer = setTimeout(() => setExpired(true), Math.max(0, until-Date.now())); return () => clearTimeout(timer); }, [until]);
  const progress = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (expired) return;
    const animation = Animated.loop(Animated.timing(progress, {toValue:1,duration:2400,easing:Easing.out(Easing.cubic),useNativeDriver:Platform.OS === 'ios',isInteraction:false}));
    animation.start(); return () => animation.stop();
  }, [expired, progress]);
  if (expired) return null;
  return <Animated.View pointerEvents="none" testID={`activity-halo-${id}`} style={[styles.ring, {
    opacity:progress.interpolate({inputRange:[0,0.15,0.75,1],outputRange:[0,1,1,0]}),
    transform:[{scale:progress.interpolate({inputRange:[0,1],outputRange:[0.05,1]})}],
  }]}><Svg width={44} height={44}><Defs><RadialGradient id={`pulse-${id}`}><Stop offset="0.72" stopColor={signalColors[category]} stopOpacity={1}/><Stop offset="1" stopColor={signalColors[category]} stopOpacity={0}/></RadialGradient></Defs><Circle cx={22} cy={22} r={22} fill={`url(#pulse-${id})`} /></Svg></Animated.View>;
}
const styles = StyleSheet.create({ring:{position:'absolute',left:0,top:0,width:44,height:44}});
