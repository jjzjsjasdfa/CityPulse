import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { demoApiURL } from './demoHost';
import { DEMO_MODE, demoQuery, appNow, nearbyRadius } from '../demo';

import type { ApiErrorEnvelope, EventDetail, EventPage, MapEvent, MapEventsResponse, NearbyEvent, NearbyEventsResponse } from './types';
import type { Coordinate } from '../map/geo';
import { loadMapPages } from '../map/loadPages';
import { queryBounds, type MapBounds } from '../map/presentation';

const emulatorHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const apiURL = () => DEMO_MODE ? demoApiURL(process.env.EXPO_PUBLIC_DEMO_API_URL, Constants.expoConfig?.hostUri, Platform.OS,
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : undefined) :
  (process.env.EXPO_PUBLIC_API_URL ?? `http://${emulatorHost}:8000/api/v1`);
export const demoURL = (path: string) => `${apiURL()}${path}${path.includes('?') ? '&' : '?'}${demoQuery()}`;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(DEMO_MODE ? demoURL(path) : `${apiURL()}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorEnvelope;
    throw new ApiError(payload.error?.message ?? '连接服务失败，请稍后再试', response.status);
  }
  return (await response.json()) as T;
}

export interface EventFilters {
  category?: string;
  sort?: 'newest' | 'soonest' | 'ending_soon';
}

export async function listEvents(filters: EventFilters = {}): Promise<EventPage> {
  const params = new URLSearchParams({ city: '长沙', page_size: '50' });
  if (filters.category) params.set('category', filters.category);
  if (filters.sort) params.set('sort', filters.sort);
  return request<EventPage>(`/events?${params.toString()}`);
}

export async function getEvent(id: string, signal?: AbortSignal): Promise<EventDetail> {
  const response = await request<{ data: EventDetail }>(`/events/${id}`, { signal });
  return response.data;
}

export async function listMapEvents(
  bounds: MapBounds,
  category?: string,
  signal?: AbortSignal,
  onPage?: (points: MapEvent[]) => void,
): Promise<MapEvent[]> {
  const points = new Map<string, MapEvent>();
  for (const part of queryBounds(bounds)) {
    const params = new URLSearchParams({
      west: String(part.west), south: String(part.south), east: String(part.east),
      north: String(part.north), limit: '500',
    });
    if (category) params.set('category', category);
    await loadMapPages((offset) => {
      params.set('offset', String(offset));
      return request<MapEventsResponse>(`/events/map?${params.toString()}`, { signal });
    }, signal, (batch) => {
      batch.forEach((point) => points.set(point.id, point));
      onPage?.([...points.values()]);
    });
  }
  return [...points.values()];
}

export async function submitCorrection(input: {
  event_id: string;
  kind: string;
  message: string;
}): Promise<void> {
  await request('/corrections', { method: 'POST', body: JSON.stringify(input) });
}

export async function listNearbyUpdates(position: Coordinate, since: string | null, signal: AbortSignal) {
  const radius = nearbyRadius();
  if (radius === 0) return { events: [], checkedAt: new Date(appNow()).toISOString() };
  const params = new URLSearchParams({ latitude: String(position.latitude), longitude: String(position.longitude), radius_km: String(radius), limit: '500' });
  if (since) params.set('since', since);
  const events = new Map<string, NearbyEvent>();
  let offset = 0;
  let checkedAt = '';
  while (!signal.aborted) {
    params.set('offset', String(offset));
    const page = await request<NearbyEventsResponse>(`/events/nearby-updates?${params}`, { signal });
    if (signal.aborted) throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
    if (!checkedAt) { checkedAt = page.checked_at; params.set('until', checkedAt); }
    page.data.forEach((event) => events.set(event.id, event));
    if (!page.meta.has_next) return { events: [...events.values()], checkedAt };
    if (page.meta.next_offset == null || page.meta.next_offset <= offset) throw new Error('附近活动分页异常');
    offset = page.meta.next_offset;
  }
  throw Object.assign(new Error('请求已取消'), { name: 'AbortError' });
}
