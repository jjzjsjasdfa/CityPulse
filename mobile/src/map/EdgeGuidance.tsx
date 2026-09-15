import { useEffect, useMemo, useRef, useState, type RefObject } from 'react';
import { AccessibilityInfo, AppState, StyleSheet, View } from 'react-native';
import { EdgeRibbon } from './EdgeRibbon';

import type { EventCategory, NearbyEvent } from '../api/types';
import { appNow, nearbyRadius } from '../demo';
import { updateKey } from './nearbyState';
import { advanceGlows, DIRECTIONS, guidanceTargets, type GlowState } from './guidance';
import { getMapLevel, boundsFromRegion, type MapRegion, type MapSession } from './presentation';
import { distanceKm, type Coordinate, type MapSize } from './geo';

export function EdgeGuidance({ session, events, position, viewport, size, onSeen, renderedIds, topInset = 120 }: {
  session: MapSession;
  events: NearbyEvent[]; position: Coordinate | null; viewport: RefObject<MapRegion>;
  size: MapSize; onSeen: (ids: string[]) => void; renderedIds: ReadonlySet<string>; topInset?: number;
}) {
  const radius = nearbyRadius();
  const distances = useMemo(() => new Map(events.map((event) => [event.id, position ? distanceKm(position, event) : Infinity])), [events, position?.latitude, position?.longitude]);
  const latest = useRef({ events, position, size, onSeen, renderedIds, topInset, distances, radius });
  latest.current = { events, position, size, onSeen, renderedIds, topInset, distances, radius };
  const [frame, setFrame] = useState({ glows: [] as GlowState[], seconds: 0, intro: 0 });
  const introStart = useRef<number | null>(null);
  const introCategories = useRef<EventCategory[]>([]);
  const glowState = useRef<GlowState[]>([]);
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReducedMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReducedMotion);
    return () => sub.remove();
  }, []);
  const running = Boolean(position && radius > 0 && events.some((event) => distances.get(event.id)! <= radius &&
    Date.parse(event.ends_at) > appNow() && !['ended', 'cancelled', 'postponed'].includes(event.status)));
  useEffect(() => {
    let animation = 0, last = 0, glows = glowState.current;
    let paused = Boolean(AppState.currentState && AppState.currentState !== 'active');
    const entered = new Map<string, number>();
    const acknowledged = new Set<string>();
    const tick = (time: number) => {
      if (paused) { animation = 0; return; }
      animation = requestAnimationFrame(tick);
      if (time - last < (reducedMotion ? 80 : 33)) return;
      const dt = last ? (time - last) / 1000 : 0.033;
      last = time;
      const input = latest.current;
      if (!session.introPlayed && input.position && running) {
        session.introPlayed = true; introStart.current = time;
        const categories = [...new Set(input.events.filter((event) => input.distances.get(event.id)! <= input.radius && Date.parse(event.ends_at) > appNow()).map((event) => event.category))];
        introCategories.current = categories;
      }
      const age = introStart.current == null ? Infinity : time - introStart.current;
      const intro = age < 500 ? 1 : Math.max(0, 1 - (age - 500) / 1000) ** 2;
      const shown = getMapLevel(boundsFromRegion(viewport.current)) !== 'saved';
      const result = guidanceTargets(input.events, input.position, viewport.current, input.size, appNow(), input.topInset, shown, input.renderedIds, input.radius, input.distances);
      const central = new Set(shown ? result.central : []);
      const versions = new Map(input.events.map((event) => [event.id, updateKey(event)]));
      const centralVersions = new Set([...central].map((key) => versions.get(key)!));
      for (const key of entered.keys()) if (!centralVersions.has(key)) entered.delete(key);
      const seen: string[] = [];
      for (const key of central) {
        const version = versions.get(key)!;
        if (!entered.has(version)) entered.set(version, time);
        if (age >= 500 && time - entered.get(version)! >= 350 && !acknowledged.has(version)) { seen.push(key); acknowledged.add(version); }
      }
      if (seen.length) input.onSeen(seen);
      glows = advanceGlows(glows, result.targets, dt);
      glowState.current = glows;
      setFrame({ glows, seconds: reducedMotion ? 0 : time / 1000, intro });
      if (!running && glows.length === 0 && !intro) { cancelAnimationFrame(animation); animation = 0; }
    };
    animation = requestAnimationFrame(tick);
    const subscription = AppState.addEventListener('change', (state) => {
      paused = state !== 'active';
      last = 0;
      if (paused) { cancelAnimationFrame(animation); animation = 0; }
      else if (!animation) animation = requestAnimationFrame(tick);
    });
    return () => { cancelAnimationFrame(animation); subscription.remove(); };
  }, [running, viewport, reducedMotion]);

  const activeDirections = [...new Set(frame.glows.map((glow) => DIRECTIONS[glow.direction]))].join('、');
  return <View pointerEvents="none" style={StyleSheet.absoluteFill} testID="edge-guidance"
    accessibilityLabel={activeDirections ? `附近新活动方向：${activeDirections}` : '当前没有未查看的新活动指引'}>
    <EdgeRibbon size={size} glows={frame.glows} seconds={frame.seconds} intro={frame.intro} categories={introCategories.current} reduced={reducedMotion} />
  </View>;
}
