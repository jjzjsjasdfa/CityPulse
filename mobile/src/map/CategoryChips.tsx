import { Animated, Pressable, ScrollView, Text } from 'react-native';
import type { EventCategory } from '../api/types';
import { categoryColors, categoryLabels } from '../theme';
import { useEffect, useRef } from 'react';

export function CategoryChips({ shown, hidden, toggle, top }: { shown: boolean; hidden: ReadonlySet<EventCategory>; toggle: (category: EventCategory) => void; top: number }) {
  const opacity = useRef(new Animated.Value(shown ? 1 : 0)).current;
  useEffect(() => { const animation = Animated.timing(opacity, {toValue:shown?1:0,duration:200,useNativeDriver:true}); animation.start(); return () => animation.stop(); }, [shown,opacity]);
  return <Animated.View pointerEvents={shown ? 'box-none' : 'none'} style={{position:'absolute',left:0,right:0,top,opacity,transform:[{translateY:opacity.interpolate({inputRange:[0,1],outputRange:[-8,0]})}]}}>
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{paddingHorizontal:16,gap:6,paddingVertical:4}}>
      {(Object.keys(categoryLabels) as EventCategory[]).map(category => <Pressable key={category} accessibilityRole="checkbox" accessibilityLabel={`筛选${categoryLabels[category]}`} accessibilityState={{checked:!hidden.has(category)}} onPress={() => toggle(category)}
        style={{backgroundColor:hidden.has(category)?'#FFFFFF':categoryColors[category],borderRadius:10,paddingHorizontal:12,paddingVertical:7,borderWidth:1,borderColor:categoryColors[category]}}>
        <Text style={{fontSize:12,lineHeight:16,fontWeight:'700',color:hidden.has(category)?categoryColors[category]:'#FFFFFF'}}>{categoryLabels[category]}</Text>
      </Pressable>)}
    </ScrollView>
  </Animated.View>;
}
