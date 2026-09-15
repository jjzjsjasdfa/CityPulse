import type { MapRegion } from './presentation';

export interface Coordinate { latitude: number; longitude: number }
export interface MapSize { width: number; height: number }
export interface ScreenPoint { x: number; y: number }
export const SCALE_BAR_PX = 100;
export const NEARBY_RADIUS_KM = 7;
const radians = (degrees: number) => degrees * Math.PI / 180;
const wrap = (value: number) => ((value + 180) % 360 + 360) % 360 - 180;

export function distanceKm(a: Coordinate, b: Coordinate): number {
  const dLat = radians(b.latitude - a.latitude), dLon = radians(wrap(b.longitude - a.longitude));
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(radians(a.latitude)) * Math.cos(radians(b.latitude)) * Math.sin(dLon / 2) ** 2;
  return 6371.0088 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}

export function regionAtDefaultScale(center: Coordinate, size: MapSize): MapRegion {
  const latitude = Math.max(-85, Math.min(85, center.latitude));
  const widthKm = Math.max(1, size.width) / SCALE_BAR_PX * 0.5;
  const longitudeDelta = widthKm / (111.32 * Math.cos(radians(latitude)));
  return {
    latitude, longitude: wrap(center.longitude), longitudeDelta,
    latitudeDelta: widthKm * Math.max(1, size.height) / Math.max(1, size.width) / 111.32,
  };
}

export function projectPoint(point: Coordinate, region: MapRegion, size: MapSize): ScreenPoint {
  // Maps are kept north-up without pitch. Within 15 km this agrees with the map's
  // region bounds to sub-pixel accuracy at ordinary city latitudes.
  return {
    x: size.width * (0.5 + wrap(point.longitude - region.longitude) / region.longitudeDelta),
    y: size.height * (0.5 - (point.latitude - region.latitude) / region.latitudeDelta),
  };
}

export function scaleBar(region: MapRegion, width: number) {
  const kmPerPixel = region.longitudeDelta * 111.32 * Math.cos(radians(region.latitude)) / width;
  const km = kmPerPixel * SCALE_BAR_PX;
  const value = Number(km.toPrecision(3));
  return { width: SCALE_BAR_PX, label: value >= 1 ? `${value} 公里` : `${Math.round(value * 1000)} 米` };
}
