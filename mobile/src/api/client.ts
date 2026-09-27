import Constants from 'expo-constants';
import { readSession, writeSession } from './sessionStorage';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { demoApiURL } from './demoHost';
import { DEMO_MODE, demoQuery, appNow, nearbyRadius } from '../demo';
import type { AdminEventDetail, AdminEventUpdate, EventRevision, AdminCorrection, CorrectionReview, CandidateComparison } from './types';
import type { ApiErrorEnvelope, Candidate, CandidateApproval, CandidateStatus, EventDetail, EventPage, LoginResponse, MapEvent, User } from './types';
import type { MapEventsResponse, NearbyEvent, NearbyEventsResponse } from './types';
import type { Coordinate } from '../map/geo';
import { loadMapPages } from '../map/loadPages';
import { queryBounds, type MapBounds } from '../map/presentation';

let accessToken: string | null = null;
const LAST_ACCOUNT = '@citypulse/last-account-v1';
export async function lastAccount(): Promise<string> {
  return (await AsyncStorage.getItem(LAST_ACCOUNT)) || '';
}
async function rememberSession(result: LoginResponse) {
  await persistSession(JSON.stringify({ access_token: result.access_token, expires_at: result.expires_at, origin: realApiURL() }));
  await AsyncStorage.setItem(LAST_ACCOUNT, result.user.email);
}
export async function renewSession(): Promise<LoginResponse | null> {
  const token = accessToken;
  if (!token) return null;
  const result = await request<LoginResponse>('/auth/session', { method: 'POST', signal: AbortSignal.timeout(10000) });
  if (accessToken !== token) return null;
  await rememberSession(result);
  return result;
}
let storageWrites: Promise<void> = Promise.resolve();
function persistSession(value: string | null) {
  storageWrites = storageWrites.catch(() => undefined).then(() => writeSession(value));
  return storageWrites;
}
let onUnauthorized: (() => void) | undefined;
export function setAuthHandler(handler: () => void) { onUnauthorized = handler; }
export function clearSession() { accessToken = null; void persistSession(null).catch(() => undefined); }

export async function restoreSession(): Promise<LoginResponse | null> {
  await storageWrites.catch(() => undefined);
  const raw = await readSession();
  if (!raw) return null;
  let saved: { access_token: string; expires_at: string; origin: string };
  try {
    saved = JSON.parse(raw);
    if (!saved.access_token || saved.origin !== realApiURL() || !Number.isFinite(Date.parse(saved.expires_at))) throw new Error();
  } catch { clearSession(); return null; }
  accessToken = saved.access_token;
  try {
    return await renewSession();
  } catch (error) {
    accessToken = null;
    if (error instanceof ApiError && error.status === 401) return null;
    // Keep the saved credential on temporary network failures so retry can restore it.
    throw error;
  }
}

const emulatorHost = Platform.OS === 'android' ? '10.0.2.2' : 'localhost';
function developmentHost() {
  if (__DEV__ && Platform.OS !== 'web' && Constants.expoConfig?.hostUri) {
    try { return new URL(`http://${Constants.expoConfig.hostUri.replace(/^https?:\/\//, '')}`).hostname; } catch {}
  }
  return emulatorHost;
}
export const realApiURL = () => process.env.EXPO_PUBLIC_API_URL ?? `http://${developmentHost()}:8000/api/v1`;
export const apiURL = () => DEMO_MODE ? demoApiURL(process.env.EXPO_PUBLIC_DEMO_API_URL, Constants.expoConfig?.hostUri, Platform.OS,
  Platform.OS === 'web' && typeof window !== 'undefined' ? window.location.hostname : undefined) :
  realApiURL();
export const demoURL = (path: string) => `${apiURL()}${path}${path.includes('?') ? '&' : '?'}${demoQuery()}`;

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const requestToken = accessToken;
  const real = !DEMO_MODE || path.startsWith('/auth/');
  if (DEMO_MODE && path.startsWith('/admin/')) throw new ApiError('调试已开启，暂无法审批。请关闭调试后继续。', 409);
  const response = await fetch(real ? `${realApiURL()}${path}` : demoURL(path), {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(real && accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorEnvelope;
    if (response.status === 401 && real && requestToken && requestToken === accessToken) {
      clearSession();
      onUnauthorized?.();
    }
    const details = payload.error?.details;
    const validation = Array.isArray(details) ? details.map((item) => `${item.loc?.slice(1).join('.')}: ${item.msg}`).join('\n') : '';
    throw new ApiError(validation || payload.error?.message || '连接服务失败，请稍后再试', response.status);
  }
  return response.status === 204 ? undefined as T : (await response.json()) as T;
}

export async function signIn(email: string, password: string): Promise<LoginResponse> {
  const result = await request<LoginResponse>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
  accessToken = result.access_token;
  await rememberSession(result);
  return result;
}
export async function register(email: string, password: string): Promise<User> {
  return request<User>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export async function signOut(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
  clearSession();
  await storageWrites;
}
export function listCandidates(status: CandidateStatus, offset = 0): Promise<Candidate[]> {
  return request(`/admin/candidates?status=${status}&offset=${offset}&limit=20`);
}
export function approveCandidate(id: string, input: CandidateApproval): Promise<Candidate> {
  return request(`/admin/candidates/${id}/approve`, { method: 'POST', body: JSON.stringify(input) });
}
export function rejectCandidate(candidate: Candidate, review_note: string): Promise<Candidate> {
  return request(`/admin/candidates/${candidate.id}/reject`, { method: 'POST', body: JSON.stringify({ review_note, expected_updated_at: candidate.updated_at }) });
}
export function enrichCandidate(candidate: Candidate): Promise<Candidate> {
  return request(`/admin/candidates/${candidate.id}/enrich`, { method: 'POST', body: JSON.stringify({ expected_updated_at: candidate.updated_at }) });
}

export interface EventFilters {
  category?: string;
  sort?: 'newest' | 'soonest' | 'ending_soon';
  time_scope?: 'upcoming' | 'past';
  page?: number;
  q?: string;
  when?: 'any' | 'today' | 'weekend';
}

export async function listEvents(filters: EventFilters = {}): Promise<EventPage> {
  const params = new URLSearchParams({ city: '长沙', page_size: '50' });
  if (filters.category) params.set('category', filters.category);
  if (filters.sort) params.set('sort', filters.sort);
  if (filters.time_scope) params.set('time_scope', filters.time_scope);
  if (filters.page) params.set('page', String(filters.page));
  if (filters.q) params.set('q', filters.q);
  if (filters.when) params.set('when', filters.when);
  return request<EventPage>(`/events?${params.toString()}`);
}

export function candidateComparison(id: string): Promise<CandidateComparison> {
  return request(`/admin/candidates/${id}/comparison`);
}
export function listAdminEvents(offset = 0, q = '', published?: boolean): Promise<AdminEventDetail[]> {
  const params = new URLSearchParams({ offset: String(offset), limit: '20', q });
  if (published !== undefined) params.set('published', String(published));
  return request(`/admin/events?${params}`);
}
export function getAdminEvent(id: string): Promise<AdminEventDetail> { return request(`/admin/events/${id}`); }
export function updateAdminEvent(id: string, body: AdminEventUpdate): Promise<AdminEventDetail> {
  return request(`/admin/events/${id}`, { method: 'PUT', body: JSON.stringify(body) });
}
export function eventRevisions(id: string, offset = 0): Promise<EventRevision[]> {
  return request(`/admin/events/${id}/revisions?offset=${offset}&limit=20`);
}
export function listCorrections(status: AdminCorrection['status'], offset = 0): Promise<AdminCorrection[]> {
  return request(`/admin/corrections?status=${status}&offset=${offset}&limit=20`);
}
export function reviewCorrection(id: string, body: CorrectionReview): Promise<AdminCorrection> {
  return request(`/admin/corrections/${id}/review`, { method: 'POST', body: JSON.stringify(body) });
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
