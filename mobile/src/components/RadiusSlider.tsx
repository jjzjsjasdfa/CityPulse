import { useMemo, useRef } from 'react';
import { PanResponder, View } from 'react-native';
export function RadiusSlider({ value, onChange }: { value: number; onChange: (value: number) => void }) {
  const width = useRef(250), origin = useRef(0), current = useRef(onChange); current.current = onChange;
  const update = (x: number) => current.current(Math.round(Math.max(0, Math.min(1, x / width.current)) * 30));
  const pan = useMemo(() => PanResponder.create({ onStartShouldSetPanResponder:()=>true,
    onPanResponderGrant:event=>{origin.current=event.nativeEvent.locationX;update(origin.current);},
    onPanResponderMove:(_event,gesture)=>update(origin.current+gesture.dx),
  }), []);
  return <View {...pan.panHandlers} accessibilityRole="adjustable" accessibilityLabel="新活动提示半径"
    accessibilityValue={{min:0,max:30,now:value,text:`${value} 公里`}} accessibilityActions={[{name:'increment'},{name:'decrement'}]}
    onAccessibilityAction={({nativeEvent})=>onChange(Math.max(0,Math.min(30,value+(nativeEvent.actionName==='increment'?1:-1))))}
    onLayout={event=>{width.current=event.nativeEvent.layout.width;}} style={{height:40,justifyContent:'center'}}>
    <View pointerEvents="none" style={{height:5,borderRadius:3,backgroundColor:'#D7E9E5'}} />
    <View pointerEvents="none" style={{position:'absolute',width:`${value/30*100}%`,height:5,backgroundColor:'#29BBA7'}} />
    <View pointerEvents="none" style={{position:'absolute',left:`${value/30*100}%`,marginLeft:-11,width:22,height:22,borderRadius:11,backgroundColor:'#29BBA7'}} />
  </View>;
}
