import type { components } from './schema';

// These aliases come directly from FastAPI's checked-in OpenAPI output.
// Regenerate schema.d.ts after changing a backend response model.
export type EventCategory = components['schemas']['EventCategory'];
export type EventStatus = components['schemas']['EventStatus'];
export type EventLocation = components['schemas']['Location'];
export type EventSummary = components['schemas']['EventSummary'];
export type SourceEvidence = components['schemas']['SourceEvidence'];
export type StatusHistory = components['schemas']['StatusHistoryPublic'];
export type EventDetail = components['schemas']['EventDetail'];
export type EventPage = components['schemas']['EventPage'];
export type MapEvent = components['schemas']['MapEvent'];
export type MapEventsResponse = components['schemas']['MapEventsResponse'];
export type NearbyEvent = components['schemas']['NearbyEvent'];
export type NearbyEventsResponse = components['schemas']['NearbyEventsResponse'];

export interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}
