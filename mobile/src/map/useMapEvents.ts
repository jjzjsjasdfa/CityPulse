import { useEffect, useState } from 'react';

import { listMapEvents } from '../api/client';
import type { MapEvent } from '../api/types';
import { getMapLevel, type MapBounds } from './presentation';

export function useMapEvents(bounds: MapBounds, active: boolean, category?: string) {
  const [points, setPoints] = useState<MapEvent[]>([]);
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const [incomplete, setIncomplete] = useState(false);
  const level = getMapLevel(bounds);

  useEffect(() => {
    setLoading(false);
    if (!active || level === 'saved') return;
    const controller = new AbortController();
    let receivedPage = false;
    // Keep the last successful viewport during a gesture and the next fetch.
    // Clearing here caused every marker to blink on each zoom step.
    setLoading(true);
    setOffline(false);
    setIncomplete(false);
    // Only settled viewports reach the API; abort also stops remaining pages.
    const timer = setTimeout(() => {
      void listMapEvents(bounds, category, controller.signal, (batch) => {
        if (!controller.signal.aborted) {
          receivedPage = true;
          setPoints(batch);
        }
      }).catch(() => {
        if (controller.signal.aborted) return;
        if (receivedPage) {
          setIncomplete(true);
        } else {
          setPoints([]);
          setOffline(true);
        }
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [active, bounds, category, level]);

  return { points, loading: active && level !== 'saved' && loading, offline, incomplete };
}
