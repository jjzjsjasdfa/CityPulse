import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import type { MapEvent } from '../api/types';
import { projectPoint, type MapSize } from './geo';
import type { MapRegion } from './presentation';
import { markerSlots } from './markerLayout';

/**
 * Groups `points` for `region`/`size`, using saved priority, label `width`, and zoom flags.
 * `top`/`bottom` describe UI insets; `interacting` pauses rotation during gestures.
 */
export function useMarkerLayout(points: MapEvent[], region: MapRegion, size: MapSize, saved: ReadonlySet<string>, width: number, names: boolean, detailed: boolean, top: number, bottom: number, interacting?: React.RefObject<boolean>) {
  const slots = useMemo(() => markerSlots(points, region, size, saved, width, names, detailed, top, bottom), [points, region, size, saved, width, names, detailed, top, bottom]);
  const [phase, setPhase] = useState(0);
  const rotating = names && detailed && slots.some(slot => slot.events.length > 1);
  useEffect(() => {
    if (!rotating) return;
    const timer = setInterval(() => { if (!interacting?.current && (!AppState.currentState || AppState.currentState === 'active')) setPhase(value => value+1); }, 1000);
    return () => clearInterval(timer);
  }, [rotating,interacting]);
  return slots.map(slot => {
    const point = slot.events[(detailed ? phase : 0) % slot.events.length];
    return { point, dx: 0, dy: 0, count: slot.events.length };
  });
}
