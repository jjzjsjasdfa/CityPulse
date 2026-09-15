import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { AppState, Platform, StyleSheet, Text, View } from 'react-native';

export interface PerformanceSample { at: number; fps: number; p95: number; worst: number; slow: number; longTasks: number; needsOptimization: boolean }
export const performanceHistory: PerformanceSample[] = [];
const KEY = '@citypulse/debug-performance-v1';
export function PerformanceMonitor({ visible }: { visible: boolean }) {
  const [sample, setSample] = useState<PerformanceSample | null>(null);
  useEffect(() => {
    let frame = 0, last = 0, start = 0, streak = 0, count = 0, longTasks = 0;
    let intervals: number[] = [];
    let paused = Boolean(AppState.currentState && AppState.currentState !== 'active');
    const persist = () => { void AsyncStorage.setItem(KEY, JSON.stringify(performanceHistory)).catch(() => undefined); };
    const tick = (time: number) => {
      if (paused) { frame = 0; return; }
      frame = requestAnimationFrame(tick);
      if (!last) { last = time; start = time; return; }
      intervals.push(time-last); last = time;
      if (time-start < 1000) return;
      const sorted = [...intervals].sort((a,b)=>a-b);
      const fps = intervals.length * 1000 / (time-start), p95 = sorted[Math.floor((sorted.length-1)*0.95)];
      streak = fps < 45 || p95 > 34 ? streak+1 : 0;
      const next = {at:Date.now(),fps:Math.round(fps),p95:Math.round(p95),worst:Math.round(sorted.at(-1)!),slow:intervals.filter(value=>value>34).length,longTasks,needsOptimization:streak>=3};
      performanceHistory.push(next); if (performanceHistory.length>180) performanceHistory.shift();
      setSample(next); if (++count%10===0) persist();
      intervals=[];longTasks=0;start=time;
    };
    let observer: PerformanceObserver | undefined;
    if (Platform.OS==='web' && typeof PerformanceObserver!=='undefined' && PerformanceObserver.supportedEntryTypes?.includes('longtask')) {
      observer = new PerformanceObserver(list=>{longTasks+=list.getEntries().length;}); observer.observe({entryTypes:['longtask']});
    }
    frame=requestAnimationFrame(tick);
    const subscription=AppState.addEventListener('change',state=>{paused=state!=='active';last=0;intervals=[];streak=0;if(paused){cancelAnimationFrame(frame);frame=0;}else if(!frame)frame=requestAnimationFrame(tick);});
    return ()=>{cancelAnimationFrame(frame);subscription.remove();observer?.disconnect();persist();};
  }, []);
  if (!visible) return null;
  return <View pointerEvents="none" testID="performance-monitor" style={styles.panel}>
    <Text style={styles.text}>{Platform.OS==='web'?'页面':'JS'} FPS {sample?.fps ?? '…'} · P95 {sample?.p95 ?? '…'} ms</Text>
    <Text style={styles.text}>慢帧 {sample?.slow ?? 0}/秒 · 最长 {sample?.worst ?? '…'} ms</Text>
    <Text style={[styles.text,{color:sample?.needsOptimization?'#B33D20':'#287568'}]}>{sample?.needsOptimization?'持续不流畅 · 需要优化':sample?'正在记录 · 未发现持续卡顿':'正在采样…'}</Text>
  </View>;
}
const styles=StyleSheet.create({panel:{position:'absolute',left:12,bottom:136,padding:9,borderRadius:10,backgroundColor:'rgba(255,253,248,0.92)'},text:{fontSize:10,lineHeight:16,color:'#365652',fontVariant:['tabular-nums']}});
