import { Platform } from 'react-native';

import type { ApiErrorEnvelope, EventDetail, EventPage, MapEvent } from './types';

const emulatorHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ?? `http://${emulatorHost}:8000/api/v1`;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
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

export async function getEvent(id: string): Promise<EventDetail> {
  const response = await request<{ data: EventDetail }>(`/events/${id}`);
  return response.data;
}

export async function listMapEvents(
  bounds: { west: number; south: number; east: number; north: number },
  category?: string,
): Promise<MapEvent[]> {
  const params = new URLSearchParams({
    west: String(bounds.west),
    south: String(bounds.south),
    east: String(bounds.east),
    north: String(bounds.north),
    city: '长沙',
  });
  if (category) params.set('category', category);
  const response = await request<{ data: MapEvent[] }>(`/events/map?${params.toString()}`);
  return response.data;
}

export async function submitCorrection(input: {
  event_id: string;
  kind: string;
  message: string;
}): Promise<void> {
  await request('/corrections', { method: 'POST', body: JSON.stringify(input) });
}

