import type { EventSummary, MapEvent } from '../api/types';

export interface MapBounds { west: number; south: number; east: number; north: number }
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}
// Owned by App for this launch only; tab unmounts must not reset the camera.
export interface MapSession { region?: MapRegion; located: boolean; introPlayed?: boolean; hiddenCategories?: import('../api/types').EventCategory[] }
export type MapLevel = 'saved' | 'dots' | 'categories' | 'names';
export interface MapDetail { category: number; name: number; unsaved: number }
const smooth = (low: number, high: number, value: number) => {
  const t = Math.max(0, Math.min(1, (value - low) / (high - low)));
  return t * t * (3 - 2 * t);
};
export function mapDetail(widthKm: number): MapDetail {
  const name = 1 - smooth(2, 3, widthKm);
  return { name, category: (1 - smooth(9, 13, widthKm)) * (1 - name),
    unsaved: 1 - smooth(30, 40, widthKm) };
}

export const INITIAL_REGION: MapRegion = {
  latitude: 28.2, longitude: 112.96, latitudeDelta: 0.46, longitudeDelta: 0.3,
};
export const DAY_MS = 86_400_000;
export const MAP_LEVELS: Record<MapLevel, { label: string; hint: string }> = {
  saved: { label: '远景 · 仅收藏', hint: '放大到省域，查看范围内的全部活动' },
  dots: { label: '省域 · 颜色', hint: '颜色区分类别，圆点越大，活动越临近' },
  categories: { label: '城市 · 类别', hint: '继续放大，查看活动名称' },
  names: { label: '街区 · 名称', hint: '点击活动，查看完整名称与详情' },
};
export const TIME_SIZES = [
  { key: 'live', label: '进行中', diameter: 30 },
  { key: 'threeDays', label: '3天内', diameter: 26 },
  { key: 'week', label: '7天内', diameter: 22 },
  { key: 'fortnight', label: '15天内', diameter: 18 },
  { key: 'month', label: '30天内', diameter: 15 },
  { key: 'later', label: '更久', diameter: 12 },
] as const;

export function toMapPoint(event: EventSummary): MapEvent {
  return {
    id: event.id, name: event.name, category: event.category, status: event.status,
    starts_at: event.starts_at, ends_at: event.ends_at,
    latitude: event.location.latitude, longitude: event.location.longitude,
  };
}

export const normalizeLongitude = (longitude: number) => ((longitude + 180) % 360 + 360) % 360 - 180;

export function boundsFromRegion(region: MapRegion): MapBounds {
  return {
    west: region.longitudeDelta >= 360 ? -180 : normalizeLongitude(region.longitude - region.longitudeDelta / 2),
    east: region.longitudeDelta >= 360 ? 180 : normalizeLongitude(region.longitude + region.longitudeDelta / 2),
    south: Math.max(-90, region.latitude - region.latitudeDelta / 2),
    north: Math.min(90, region.latitude + region.latitudeDelta / 2),
  };
}

export function longitudeSpan(bounds: MapBounds): number {
  return bounds.east >= bounds.west ? bounds.east - bounds.west : 360 + bounds.east - bounds.west;
}

export function viewportWidthKm(bounds: MapBounds): number {
  return longitudeSpan(bounds) * 111.32 * Math.cos(((bounds.north + bounds.south) / 2) * Math.PI / 180);
}

export function getMapLevel(bounds: MapBounds): MapLevel {
  const width = viewportWidthKm(bounds);
  if (width >= 40 || longitudeSpan(bounds) > 20 || bounds.north - bounds.south > 30) return 'saved';
  if (width > 11) return 'dots';
  if (width > 2.5) return 'categories';
  return 'names';
}

export function isInBounds(point: Pick<MapEvent, 'latitude' | 'longitude'>, bounds: MapBounds): boolean {
  const longitudeInside = bounds.west <= bounds.east
    ? point.longitude >= bounds.west && point.longitude <= bounds.east
    : point.longitude >= bounds.west || point.longitude <= bounds.east;
  return longitudeInside && point.latitude >= bounds.south && point.latitude <= bounds.north;
}

// Half-open active interval: an event stops being live exactly at its end time.
// Invalid dates and cancelled/postponed events must never look live.
export function getTimeSize(point: Pick<MapEvent, 'starts_at' | 'ends_at' | 'status'>, now = Date.now()) {
  const start = Date.parse(point.starts_at);
  const end = Date.parse(point.ends_at);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start || end <= now ||
      ['ended', 'cancelled', 'postponed'].includes(point.status)) return TIME_SIZES[5];
  if (start <= now) return TIME_SIZES[0];
  const days = (start - now) / DAY_MS;
  if (days <= 3) return TIME_SIZES[1];
  if (days <= 7) return TIME_SIZES[2];
  if (days <= 15) return TIME_SIZES[3];
  if (days <= 30) return TIME_SIZES[4];
  return TIME_SIZES[5];
}

export function visibleMapPoints(
  points: MapEvent[], bounds: MapBounds, savedIds: ReadonlySet<string>, now = Date.now(),
): MapEvent[] {
  const savedOnly = getMapLevel(bounds) === 'saved';
  return points.filter((point) => isInBounds(point, bounds) &&
    (savedOnly ? savedIds.has(point.id) : Date.parse(point.ends_at) > now && point.status !== 'ended'));
}

// Split date-line crossings so each PostGIS envelope has west < east.
export function queryBounds(bounds: MapBounds): MapBounds[] {
  if (bounds.west < bounds.east) return [bounds];
  return [{ ...bounds, east: 180 }, { ...bounds, west: -180 }].filter((part) => part.west < part.east);
}
