import { Platform } from 'react-native';
import type { AdminEventDetail, AdminEventUpdate, EventRevision, AdminCorrection, CorrectionReview, CandidateComparison } from './types';

import type { ApiErrorEnvelope, Candidate, CandidateApproval, CandidateStatus, EventDetail, EventPage, LoginResponse, MapEvent, User } from './types';

// Session-only storage: credentials never enter AsyncStorage or browser localStorage.
let accessToken: string | null = null;
let onUnauthorized: (() => void) | undefined;
export function setAuthHandler(handler: () => void) { onUnauthorized = handler; }
export function clearSession() { accessToken = null; }

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
    headers: { 'Content-Type': 'application/json', ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}), ...init?.headers },
  });
  if (!response.ok) {
    const payload = (await response.json().catch(() => ({}))) as ApiErrorEnvelope;
    if (response.status === 401 && accessToken) {
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
  return result;
}
export async function register(email: string, password: string): Promise<User> {
  return request<User>('/auth/register', { method: 'POST', body: JSON.stringify({ email, password }) });
}
export async function signOut(): Promise<void> {
  await request('/auth/logout', { method: 'POST' });
  clearSession();
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
