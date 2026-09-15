import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { watchLocation, type Position, type LocationFailure } from './locationProvider';
import { DEMO_LOCATION, DEMO_MODE } from '../demo';

export type LocationStatus = 'locating' | 'ready' | LocationFailure;
export function useDeviceLocation() {
  const [position, setPosition] = useState<Position | null>(null);
  const [status, setStatus] = useState<LocationStatus>('locating');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (DEMO_MODE) {
      setPosition({ ...DEMO_LOCATION, accuracy: 0, timestamp: Date.now() });
      setStatus('ready');
      return;
    }
    let generation = 0;
    let stop: (() => void) | undefined;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const pause = () => { generation++; stop?.(); stop = undefined; clearTimeout(timeout); };
    const start = async () => {
      pause();
      const current = generation;
      setStatus('locating');
      timeout = setTimeout(() => { if (current === generation) setStatus('unavailable'); }, 15_000);
      try {
        const cleanup = await watchLocation((next) => {
          if (current !== generation || !Number.isFinite(next.latitude) || !Number.isFinite(next.longitude)) return;
          clearTimeout(timeout);
          setPosition(next);
          setStatus('ready');
        }, (reason) => {
          if (current === generation) { clearTimeout(timeout); setStatus(reason); setPosition(null); }
        });
        if (current !== generation) cleanup();
        else stop = cleanup;
      } catch {
        if (current === generation) { clearTimeout(timeout); setStatus('unavailable'); setPosition(null); }
      }
    };
    void start();
    const subscription = AppState.addEventListener('change', (state) => { if (state === 'active') void start(); else pause(); });
    return () => { pause(); subscription.remove(); };
  }, [retry]);
  const retryLocation = useCallback(() => setRetry((value) => value + 1), []);
  return { position, status, retryLocation };
}
