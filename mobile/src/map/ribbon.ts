import type { EventCategory } from '../api/types';
import { signalColors } from '../theme';
import { directionWeights, type GlowState } from './guidance';
import type { MapSize } from './geo';

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const palette = Object.fromEntries(Object.entries(signalColors).map(([key, color]) => [key, rgb(color)])) as Record<EventCategory, number[]>;
const clamp = (n: number) => Math.max(0, Math.min(1, n));
export function ribbonGeometry(size: MapSize) {
  const depth = 24, steps = 8;
  const edge = (side: number, t: number, inset: number) => {
    const w = size.width - inset * 2, h = size.height - inset * 2;
    return side === 0 ? { x: inset + w * t, y: inset } : side === 1 ? { x: size.width - inset, y: inset + h * t } :
      side === 2 ? { x: size.width - inset - w * t, y: size.height - inset } : { x: inset, y: size.height - inset - h * t };
  };
  return Array.from({ length: steps * 4 }, (_, index) => {
    const side = Math.floor(index / steps), t = index % steps / steps;
    const a = edge(side, t, 0), b = edge(side, t + 1 / steps, 0);
    const c = edge(side, t + 1 / steps, depth), d = edge(side, t, depth);
    return { a, b, t: index / (steps * 4), path: `M${a.x},${a.y} L${b.x},${b.y} L${c.x},${c.y} L${d.x},${d.y} Z` };
  });
}

export function ribbonColor(x: number, y: number, t: number, size: MapSize, glows: GlowState[], seconds: number,
  intro: number, categories: EventCategory[], reduced = false) {
  if (!categories.length) intro = 0;
  const weights = directionWeights((x - size.width / 2) / size.width, (y - size.height / 2) / size.height);
  let total = 0, strength = 0; const color = [0, 0, 0];
  for (const { direction, weight } of weights) {
    const group = glows.filter((glow) => glow.direction === direction);
    strength += weight * Math.max(0, ...group.map((glow) => glow.strength));
    for (const glow of group) {
      const wave = reduced ? 1 : 0.05 + 0.95 * ((Math.sin(seconds * 1.7 + glow.phase + t * Math.PI * 2) + 1) / 2) ** 3;
      const amount = weight * glow.strength * (glow.multi ? wave : 1);
      total += amount; palette[glow.category].forEach((value, channel) => { color[channel] += value * amount; });
    }
  }
  const alpha = clamp(strength / 0.5) * (1 - intro);
  const mixed = color.map((value) => total ? value / total * alpha : 0);
  if (intro && categories.length) {
    const phase = ((t * categories.length - (reduced ? 0 : seconds * 3)) % categories.length + categories.length) % categories.length;
    const a = palette[categories[Math.floor(phase)]], b = palette[categories[(Math.floor(phase) + 1) % categories.length]];
    const fraction = phase % 1, blend = fraction * fraction * (3 - 2 * fraction);
    a.forEach((value, channel) => { mixed[channel] += (value + (b[channel] - value) * blend) * intro; });
  }
  const opacity = alpha + intro;
  return { color: `rgb(${mixed.map((value) => Math.round(opacity ? value / opacity : 0)).join(',')})`, opacity };
}
