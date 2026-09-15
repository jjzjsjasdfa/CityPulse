import * as Location from 'expo-location';
import type { Coordinate } from './geo';

export type Position = Coordinate & { accuracy: number | null; timestamp: number };
export type LocationFailure = 'denied' | 'unavailable';
export async function watchLocation(
  onPosition: (point: Position) => void, onFailure: (reason: LocationFailure) => void,
): Promise<() => void> {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (!permission.granted) { onFailure('denied'); return () => {}; }
  if (!await Location.hasServicesEnabledAsync()) { onFailure('unavailable'); return () => {}; }
  const subscription = await Location.watchPositionAsync({
    accuracy: Location.Accuracy.Balanced, distanceInterval: 20, timeInterval: 10_000,
  }, (location) => onPosition({
    latitude: location.coords.latitude, longitude: location.coords.longitude,
    accuracy: location.coords.accuracy, timestamp: location.timestamp,
  }), () => onFailure('unavailable'));
  return () => subscription.remove();
}
