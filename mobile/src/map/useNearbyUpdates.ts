import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from 'react-native';
import { listNearbyUpdates } from '../api/client';
import type { NearbyEvent } from '../api/types';
import type { Coordinate } from './geo';
import { acknowledgeNearby, EMPTY_NEARBY, mergeNearby, readNearbyState, viewNearby } from './nearbyState';
import { appNow, storageKey } from '../demo';

export const NEARBY_POLL_MS = 60_000;

export function useNearbyUpdates(position: Coordinate | null, active: boolean) {
  const [KEY] = useState(() => storageKey('nearby-updates-v2'));
  const [state, setState] = useState(EMPTY_NEARBY);
  const [points, setPoints] = useState<NearbyEvent[]>([]);
  const [ready, setReady] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [revision, setRevision] = useState(0);
  const latestState = useRef(state);
  latestState.current = state;
  useEffect(() => {
    let mounted = true;
    void Promise.all([AsyncStorage.getItem(KEY),AsyncStorage.getItem(storageKey('activity-alerts-v1'))]).then(([value,alerts]) => {
      if (mounted) {
        const restored = readNearbyState(value);
        if (restored.watermark && Date.parse(restored.watermark) > appNow()) restored.watermark = null;
        const current = (event: NearbyEvent) => Date.parse(event.published_at) <= appNow() && Date.parse(event.ends_at) > appNow();
        restored.pending = restored.pending.filter(current); restored.unread = restored.unread.filter(current);
        const completed = new Set<string>(JSON.parse(alerts ?? '[]'));
        // A previous launch reaching the map is not the one-minute completion condition.
        restored.pending = restored.unread.filter(event => !completed.has(`${event.id}:${event.published_at}`) && !restored.viewed.includes(`${event.id}:${event.published_at}`));
        const pendingVersions = new Set(restored.pending.map(event => `${event.id}:${event.published_at}`));
        restored.seen = restored.seen.filter(version => !pendingVersions.has(version));
        setState(restored); setPoints([...restored.pending, ...restored.unread]);
      }
    })
      .catch(() => undefined).finally(() => { if (mounted) setReady(true); });
    return () => { mounted = false; };
  }, []);
  useEffect(() => { if (ready) void AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => undefined); }, [state, ready]);

  // GPS timestamps/accuracy changes must not restart a network poll.
  const latitude = position?.latitude, longitude = position?.longitude;
  useEffect(() => {
    if (!ready || !active || latitude == null || longitude == null) return;
    let stopped = false;
    let controller: AbortController | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const poll = async () => {
      if (stopped || (AppState.currentState && AppState.currentState !== 'active')) return;
      controller?.abort();
      const request = new AbortController();
      controller = request;
      try {
        const result = await listNearbyUpdates({ latitude, longitude }, latestState.current.watermark, request.signal);
        if (!request.signal.aborted && !stopped) {
          setState((current) => mergeNearby(current, result.events, result.checkedAt, appNow()));
          setPoints((current) => {
            const merged = new Map(current.map((event) => [event.id, event]));
            result.events.forEach((event) => merged.set(event.id, event));
            return [...merged.values()].filter((event) => Date.parse(event.ends_at) > appNow());
          });
          setUnavailable(false);
        }
      } catch {
        if (!request.signal.aborted && !stopped) setUnavailable(true);
      } finally {
        if (!request.signal.aborted && !stopped) timer = setTimeout(() => { void poll(); }, NEARBY_POLL_MS);
      }
    };
    void poll();
    const subscription = AppState.addEventListener('change', (next) => {
      clearTimeout(timer);
      controller?.abort();
      if (next === 'active') void poll();
    });
    return () => { stopped = true; clearTimeout(timer); controller?.abort(); subscription.remove(); };
  }, [latitude, longitude, active, ready, revision]);

  const acknowledge = useCallback((ids: string[]) => setState((current) => acknowledgeNearby(current, ids)), []);
  const refresh = useCallback(() => setRevision((value) => value + 1), []);
  const view = useCallback((id: string) => setState((current) => current.unread.some((event) => event.id === id) ? viewNearby(current, id) : current), []);
  return { events: state.pending, unread: state.unread, points, acknowledge, view, unavailable, refresh };
}
