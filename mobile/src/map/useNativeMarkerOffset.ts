import { useEffect, useRef } from 'react';
import { Animated, Easing, Platform } from 'react-native';
import type { MapMarker } from 'react-native-maps';

/** Animate only a layout relocation; native map panning never depends on JS. */
export function useNativeMarkerOffset(marker: React.RefObject<MapMarker | null>, dx: number, dy: number, width: number, height: number) {
  const value = useRef(new Animated.ValueXY({x:dx,y:dy})).current;
  const previous = useRef({x:dx,y:dy});
  useEffect(() => {
    const listener = value.addListener(({x,y}) => marker.current?.setNativeProps(Platform.OS === 'ios' ?
      {centerOffset:{x,y:height/2-22+y}} : {anchor:{x:0.5-x/width,y:(22-y)/height}}));
    return () => value.removeListener(listener);
  }, [value,marker,width,height]);
  useEffect(() => {
    if (Math.hypot(dx-previous.current.x,dy-previous.current.y)<0.5) return;
    previous.current={x:dx,y:dy};
    const animation=Animated.timing(value,{toValue:{x:dx,y:dy},duration:180,easing:Easing.out(Easing.cubic),useNativeDriver:false,isInteraction:false});
    animation.start();return () => animation.stop();
  }, [dx,dy,value]);
  return useRef({anchor:{x:0.5-dx/width,y:(22-dy)/height},centerOffset:{x:dx,y:height/2-22+dy}}).current;
}
