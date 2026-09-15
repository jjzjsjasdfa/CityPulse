import type { MapEvent } from '../api/types';
import { distanceKm, projectPoint, type MapSize } from './geo';
import type { MapRegion } from './presentation';
export interface MarkerSlot { x: number; y: number; events: MapEvent[] }
// Only close coordinates with overlapping dots share a full-name slot.
export function markerSlots(points: MapEvent[], region: MapRegion, size: MapSize, saved: ReadonlySet<string>, _width: number, names: boolean, detailed: boolean, _top = 80, _bottom = 110) {
  const slots: MarkerSlot[] = [], grid = new Map<string, number[]>();
  for (const point of [...points].sort((a,b) => Number(saved.has(b.id))-Number(saved.has(a.id)) || a.id.localeCompare(b.id))) {
    const screen=projectPoint(point,region,size), x=Math.floor(screen.x/12), y=Math.floor(screen.y/12);
    let match: MarkerSlot | undefined;
    if (names && detailed) for(let a=x-1;a<=x+1;a++) for(let b=y-1;b<=y+1;b++) {
      for(const index of grid.get(`${a}:${b}`)??[]) {
        const slot=slots[index];
        // Do not chain many nearby sites into one group.
        if(slot.events.every(event=>{const other=projectPoint(event,region,size);return Math.hypot(other.x-screen.x,other.y-screen.y)<=12 && distanceKm(event,point)<=0.03;})) {match=slot;break;}
      }
    }
    if(match) match.events.push(point);
    else {const index=slots.length;slots.push({...screen,events:[point]});grid.set(`${x}:${y}`,[...(grid.get(`${x}:${y}`)??[]),index]);}
  }
  return slots;
}
