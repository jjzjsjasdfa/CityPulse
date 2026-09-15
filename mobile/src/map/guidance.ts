import type { EventCategory, NearbyEvent } from '../api/types';
import type { MapRegion } from './presentation';
import { distanceKm, NEARBY_RADIUS_KM, projectPoint, type Coordinate, type MapSize } from './geo';

export const DIRECTIONS = ['北', '东北', '东', '东南', '南', '西南', '西', '西北'] as const;
export interface GlowTarget { key: string; direction: number; category: EventCategory; strength: number; proximity: number }
export interface GlowState extends GlowTarget { impulse: number; phase: number; multi: number }
export const directionAngle = (direction: number) => direction * Math.PI / 4;
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));

export function directionWeights(x: number, y: number) {
  const sector = ((Math.atan2(x, -y) / (Math.PI / 4)) + 8) % 8;
  const first = Math.floor(sector);
  const fraction = sector - first;
  const mix = fraction * fraction * (3 - 2 * fraction);
  return [{ direction: first, weight: 1 - mix }, { direction: (first + 1) % 8, weight: mix }];
}

export function isInCentralArea(x: number, y: number, size: MapSize, topInset = 120) {
  return x >= size.width * 0.16 && x <= size.width * 0.84 &&
    y >= Math.max(topInset, size.height * 0.18) && y <= size.height - Math.max(100, size.height * 0.18);
}

export function guidanceTargets(events: NearbyEvent[], position: Coordinate | null, region: MapRegion,
  size: MapSize, now: number, topInset = 120, canAcknowledge = true, renderedIds?: ReadonlySet<string>, radius = NEARBY_RADIUS_KM, distances?: ReadonlyMap<string, number>) {
  const targets = new Map<string, GlowTarget>();
  const central: string[] = [];
  if (!position || radius <= 0) return { targets: [], central };
  for (const event of events) {
    if (Date.parse(event.ends_at) <= now || ['cancelled', 'ended', 'postponed'].includes(event.status)) continue;
    const distance = distances?.get(event.id) ?? distanceKm(position, event);
    if (distance > radius) continue;
    const screen = projectPoint(event, region, size);
    if (canAcknowledge && (!renderedIds || renderedIds.has(event.id)) &&
      isInCentralArea(screen.x, screen.y, size, topInset)) { central.push(event.id); continue; }
    const proximity = 1 - clamp(distance / radius);
    // Normalize axes so diagonal sectors correspond to the phone's actual corners.
    for (const { direction, weight } of directionWeights((screen.x - size.width / 2) / size.width,
      (screen.y - size.height / 2) / size.height)) {
      if (weight < 0.001) continue;
      const key = `${direction}:${event.category}`;
      const previous = targets.get(key);
      const strength = weight * (0.55 + proximity * 0.3);
      targets.set(key, { key, direction, category: event.category,
        strength: Math.max(previous?.strength ?? 0, strength), proximity: Math.max(previous?.proximity ?? 0, proximity) });
    }
  }
  return { targets: [...targets.values()], central };
}

export function advanceGlows(previous: GlowState[], targets: GlowTarget[], dt: number): GlowState[] {
  const elapsed = clamp(dt, 0, 0.1);
  const wanted = new Map(targets.map((target) => [target.key, target]));
  const groups = new Map<number, string[]>();
  for (const target of targets) groups.set(target.direction, [...(groups.get(target.direction) ?? []), target.category].sort());
  const rhythm = (glow: GlowTarget) => {
    const group = groups.get(glow.direction) ?? [];
    return { phase: group.length ? Math.max(0, group.indexOf(glow.category)) / group.length * Math.PI * 2 : 0,
      multi: group.length > 1 ? 1 : 0 };
  };
  const current = new Map(previous.map((glow) => [glow.key, glow]));
  for (const target of targets) if (!current.has(target.key)) current.set(target.key, { ...target, ...rhythm(target), strength: 0, impulse: 0 });
  const result: GlowState[] = [];
  for (const glow of current.values()) {
    const target = wanted.get(glow.key);
    const proximity = target?.proximity ?? glow.proximity;
    const change = (target?.strength ?? 0) - glow.strength;
    // Near events respond faster with a stronger ripple; disappearance always eases out.
    const tau = target ? 0.38 - proximity * 0.2 : 0.42;
    const strength = glow.strength + change * (1 - Math.exp(-elapsed / tau));
    const impulse = Math.min(0.55, glow.impulse * Math.exp(-elapsed / 0.65) + Math.abs(change) * elapsed * (0.3 + proximity * 2));
    const nextRhythm = target ? rhythm(target) : { phase: glow.phase, multi: glow.multi };
    const phaseDifference = Math.atan2(Math.sin(nextRhythm.phase - glow.phase), Math.cos(nextRhythm.phase - glow.phase));
    const phase = glow.phase + phaseDifference * (1 - Math.exp(-elapsed / 0.65));
    const multi = glow.multi + (nextRhythm.multi - glow.multi) * (1 - Math.exp(-elapsed / 0.65));
    if (strength > 0.005 || target) result.push({ ...glow, proximity, strength, impulse, phase, multi });
  }
  return result;
}

export function edgePoint(angle: number, size: MapSize) {
  const dx = Math.sin(angle), dy = -Math.cos(angle);
  const scale = 1 / Math.max(Math.abs(dx), Math.abs(dy));
  return { x: size.width / 2 * (1 + dx * scale), y: size.height / 2 * (1 + dy * scale) };
}

export function glowLobes(glows: GlowState[], seconds: number, size: MapSize, reducedMotion = false) {
  return glows.flatMap((glow) => {
    const wave = reducedMotion ? 0 : seconds * 1.7 + glow.phase + glow.direction * 0.24;
    const alternating = 0.22 + 0.78 * ((Math.sin(wave) + 1) / 2) ** 1.6;
    const cycle = reducedMotion ? 0.9 : 0.9 * (1 - glow.multi) + alternating * glow.multi;
    return [0, 1].map((lobe) => {
      const ripple = reducedMotion ? 0 : Math.sin(wave + lobe * 1.9);
      const angle = directionAngle(glow.direction) + (lobe ? 0.1 : -0.1) + ripple * (0.075 + glow.impulse * 0.16);
      const point = edgePoint(angle, size);
      const depth = 40 + 9 * (ripple + 1) + glow.impulse * 24;
      return { key: `${glow.key}:${lobe}`, category: glow.category,
        x: point.x, y: point.y,
        rx: depth + size.width * 0.38 * Math.cos(angle) ** 4,
        ry: depth + size.height * 0.26 * Math.sin(angle) ** 4,
        opacity: clamp(glow.strength * cycle * (3 + glow.impulse * 0.3)) };
    });
  });
}
