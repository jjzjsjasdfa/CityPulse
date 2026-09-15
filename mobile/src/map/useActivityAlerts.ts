import AsyncStorage from '@react-native-async-storage/async-storage';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MapEvent } from '../api/types';
import { appNow, nearbyRadius, storageKey } from '../demo';
import { distanceKm, type Coordinate } from './geo';

export const HALO_DURATION = 60_000;
export const activityVersion = (event: MapEvent) => `${event.id}:${event.published_at ?? event.starts_at}`;
export function useActivityAlerts(points: MapEvent[], position: Coordinate | null) {
  const radius = nearbyRadius();
  const latitude = position?.latitude, longitude = position?.longitude;
  const eligible = useMemo(() => new Set(points.filter(event => position && radius > 0 && distanceKm(position, event) <= radius).map(activityVersion)), [points, latitude, longitude, radius]);
  const [key] = useState(() => storageKey('activity-alerts-v1'));
  const [done, setDone] = useState<Set<string>>(new Set());
  const [ready, setReady] = useState(false);
  const [deadlines, setDeadlines] = useState<Record<string, number>>({});
  const latest = useRef(points); latest.current = points;
  const started = useRef(new Set<string>());
  const startedEvents = useRef(new Map<string, MapEvent>());
  useEffect(() => {
    // Leaving the user's radius cancels the timer without marking the event done.
    // Panning the map does not change this distance or cancel an existing timer.
    const excluded = new Set<string>();
    for (const [version, event] of startedEvents.current) {
      if (!position || radius <= 0 || distanceKm(position, event) > radius) {
        excluded.add(version); started.current.delete(version); startedEvents.current.delete(version);
      }
    }
    if (excluded.size) setDeadlines(current => Object.fromEntries(Object.entries(current).filter(([version]) => !excluded.has(version))));
  }, [latitude, longitude, radius]);
  useEffect(() => { let live = true; void Promise.all([AsyncStorage.getItem(key),AsyncStorage.getItem(storageKey('nearby-updates-v2'))]).then(([raw,old]) => {
    const data = JSON.parse(raw ?? '[]');
    if (raw == null && old) data.push(...(JSON.parse(old).viewed ?? []));
    if (live && Array.isArray(data)) setDone(new Set(data.filter(value => typeof value === 'string')));
  }).catch(() => undefined).finally(() => { if (live) setReady(true); }); return () => { live = false; }; }, [key]);
  useEffect(() => { if (ready) void AsyncStorage.setItem(key, JSON.stringify([...done].slice(-8000))).catch(() => undefined); }, [done, ready, key]);
  useEffect(() => {
    const next = Math.min(...Object.values(deadlines));
    if (!Number.isFinite(next)) return;
    const timer = setTimeout(() => {
      const expired = Object.keys(deadlines).filter(version => deadlines[version] <= Date.now());
      setDone(current => new Set([...current, ...expired]));
      setDeadlines(current => Object.fromEntries(Object.entries(current).filter(([, until]) => until > Date.now())));
    }, Math.max(0, next - Date.now()));
    return () => clearTimeout(timer);
  }, [deadlines]);
  const onVisible = useCallback((ids: string[]) => {
    if (!ready) return;
    const idSet = new Set(ids), additions: Record<string, number> = {};
    for (const event of latest.current) {
      const version = activityVersion(event);
      if (eligible.has(version) && idSet.has(event.id) && !done.has(version) && !started.current.has(version) && Date.parse(event.ends_at) > appNow() && !['ended', 'cancelled', 'postponed'].includes(event.status)) {
        startedEvents.current.set(version, event);
        started.current.add(version); additions[version] = Date.now() + HALO_DURATION;
      }
    }
    if (Object.keys(additions).length) setDeadlines(current => ({ ...current, ...additions }));
  }, [done, ready, eligible]);
  const view = useCallback((id: string) => {
    const versions = latest.current.filter(event => event.id === id).map(activityVersion);
    setDone(current => new Set([...current, ...versions]));
    setDeadlines(current => Object.fromEntries(Object.entries(current).filter(([version]) => !versions.includes(version))));
  }, []);
  return useMemo(() => ({ onVisible, view,
    completedIds: points.filter(event => done.has(activityVersion(event))).map(event => event.id),
    unreadIds: new Set(points.filter(event => ready && eligible.has(activityVersion(event)) && !done.has(activityVersion(event))).map(event => event.id)),
    haloUntil: Object.fromEntries(points.filter(event => eligible.has(activityVersion(event)) && !done.has(activityVersion(event))).map(event => [event.id, deadlines[activityVersion(event)] ?? 0])),
  }), [points, ready, done, deadlines, onVisible, view, eligible]);
}
