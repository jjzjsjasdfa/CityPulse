import type { MapEvent } from '../api/types';
import { projectPoint, type MapSize } from './geo';
import { getTimeSize, type MapRegion } from './presentation';

// All dots remain visible. Reserve room for labels in a stable priority order;
// zooming further in reveals names that did not fit in a dense cluster.
export function labelIds(points: MapEvent[], region: MapRegion, size: MapSize,
  saved: ReadonlySet<string>, width: number, names: boolean, now: number) {
  const accepted = new Set<string>();
  const rectangles: { left: number; top: number; right: number; bottom: number }[] = [];
  const sorted = [...points].sort((a, b) => Number(saved.has(b.id)) - Number(saved.has(a.id)) ||
    getTimeSize(b, now).diameter - getTimeSize(a, now).diameter || a.id.localeCompare(b.id));
  for (const point of sorted) {
    const screen = projectPoint(point, region, size);
    const labelWidth = names ? width : 68;
    const lines = names ? Math.min(3, Math.max(1, Math.ceil(point.name.length * 10 / (width - 10)))) : 1;
    const rectangle = { left: screen.x - labelWidth / 2 - 4, right: screen.x + labelWidth / 2 + 4,
      top: screen.y + 20, bottom: screen.y + 26 + lines * 16 + 4 };
    if (rectangle.left < 4 || rectangle.right > size.width - 4 || rectangle.top < 54 || rectangle.bottom > size.height - 76) continue;
    if (rectangles.some((other) => rectangle.left < other.right && rectangle.right > other.left &&
      rectangle.top < other.bottom && rectangle.bottom > other.top)) continue;
    rectangles.push(rectangle); accepted.add(point.id);
  }
  return accepted;
}
