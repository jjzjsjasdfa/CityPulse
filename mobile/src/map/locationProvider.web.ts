import type { Position, LocationFailure } from './locationProvider';

/** Starts browser geolocation updates and reports positions/failures through callbacks. */
export async function watchLocation(
  onPosition: (point: Position) => void, onFailure: (reason: LocationFailure) => void,
): Promise<() => void> {
  if (!globalThis.navigator?.geolocation) { onFailure('unavailable'); return () => {}; }
  let active = true;
  /** Converts browser `position` into the shared frontend position shape. */
  const success = (position: GeolocationPosition) => {
    if (active) onPosition({
      latitude: position.coords.latitude, longitude: position.coords.longitude,
      accuracy: position.coords.accuracy, timestamp: position.timestamp,
    });
  };
  /** Maps browser geolocation `error` to the shared failure categories. */
  const failure = (error: GeolocationPositionError) => {
    if (active) onFailure(error.code === 1 ? 'denied' : 'unavailable');
  };
  navigator.geolocation.getCurrentPosition(success, failure, { maximumAge: 0, timeout: 12_000 });
  const id = navigator.geolocation.watchPosition(success, failure, { maximumAge: 15_000, timeout: 20_000 });
  return () => { active = false; navigator.geolocation.clearWatch(id); };
}
