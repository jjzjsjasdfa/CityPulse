import { useId, useMemo } from 'react';
import Svg, { Defs, G, LinearGradient, Mask, Path, Rect, Stop } from 'react-native-svg';
import type { EventCategory } from '../api/types';
import type { GlowState } from './guidance';
import type { MapSize } from './geo';
import { ribbonColor, ribbonGeometry } from './ribbon';

export function EdgeRibbon({ size, glows, seconds, intro, categories, reduced }: {
  size: MapSize; glows: GlowState[]; seconds: number; intro: number; categories: EventCategory[]; reduced: boolean;
}) {
  const id = useId().replace(/:/g, '');
  const geometry = useMemo(() => ribbonGeometry(size), [size.width, size.height]);
  if (!glows.length && !intro) return null;
  const samples = geometry.map((part) => ribbonColor(part.a.x, part.a.y, part.t, size, glows, seconds, intro, categories, reduced));
  const depth = reduced ? 19 : 19 + 2 * Math.sin(seconds * 1.4);
  return <Svg width={size.width} height={size.height}>
    <Defs>
      {['top','right','bottom','left'].map((side, index) => <LinearGradient key={side} id={`${id}-${side}`}
        x1={index === 1 ? '100%' : '0%'} y1={index === 2 ? '100%' : '0%'}
        x2={index === 3 ? '100%' : index === 1 ? '0%' : '0%'} y2={index === 0 ? '100%' : '0%'}>
        <Stop offset="0" stopColor="white" stopOpacity="1" /><Stop offset="0.08" stopColor="white" stopOpacity="1" />
        <Stop offset="0.5" stopColor="white" stopOpacity="0.5" /><Stop offset="1" stopColor="white" stopOpacity="0" />
      </LinearGradient>)}
      <Mask id={`${id}-mask`} x={0} y={0} width={size.width} height={size.height} maskUnits="userSpaceOnUse">
        <Rect width={size.width} height={depth} fill={`url(#${id}-top)`} />
        <Rect y={size.height-depth} width={size.width} height={depth} fill={`url(#${id}-bottom)`} />
        <Rect width={depth} height={size.height} fill={`url(#${id}-left)`} />
        <Rect x={size.width-depth} width={depth} height={size.height} fill={`url(#${id}-right)`} />
      </Mask>
      {geometry.map((part, index) => <LinearGradient key={index} id={`${id}-color-${index}`} gradientUnits="userSpaceOnUse"
        x1={part.a.x} y1={part.a.y} x2={part.b.x} y2={part.b.y}>
        <Stop offset="0" stopColor={samples[index].color} stopOpacity={samples[index].opacity} />
        <Stop offset="1" stopColor={samples[(index+1)%samples.length].color} stopOpacity={samples[(index+1)%samples.length].opacity} />
      </LinearGradient>)}
    </Defs>
    <G mask={`url(#${id}-mask)`}>{geometry.map((part,index) =>
      <Path key={index} testID={`${intro ? 'startup' : 'edge'}-wave-${index}`} d={part.path}
        fill={`url(#${id}-color-${index})`} stroke={`url(#${id}-color-${index})`} strokeWidth={0.5} />)}</G>
  </Svg>;
}
