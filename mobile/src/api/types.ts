import type { components } from './schema';

/** Frontend-friendly aliases for the generated OpenAPI schema types. */

export type AdminEventDetail = components['schemas']['AdminEventDetail'];
export type AdminEventSummary = components['schemas']['AdminEventSummary'];
export type AdminEventCreate = components['schemas']['AdminEventCreate'];
export type AdminEventUpdate = components['schemas']['AdminEventUpdate'];
export type AdminEventAction = components['schemas']['AdminEventAction'];
export type AdminEventPage = components['schemas']['AdminEventPage'];
export type EventRevision = components['schemas']['AdminEventRevision'];
export type AdminCorrection = components['schemas']['AdminCorrection'];
export type AdminCorrectionSummary = components['schemas']['AdminCorrectionSummary'];
export type CorrectionReview = components['schemas']['CorrectionReview'];
export type CandidateComparison = components['schemas']['CandidateComparison'];
export type AdminUserDetail = components['schemas']['AdminUserDetail'];
export type AdminUserSummary = components['schemas']['AdminUserSummary'];
export type AdminUserCreate = components['schemas']['AdminUserCreate'];
export type AdminUserUpdate = components['schemas']['AdminUserUpdate'];
export type AdminUserPage = components['schemas']['AdminUserPage'];
export type AdminUserRevision = components['schemas']['AdminUserRevision'];
export type UserRole = components['schemas']['UserRole'];

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
export type User = components['schemas']['UserPublic'];
export type LoginResponse = components['schemas']['LoginResponse'];
export type Candidate = components['schemas']['AdminCandidate'];
export type CandidateSummary = components['schemas']['AdminCandidateSummary'];
export type CandidateApproval = components['schemas']['CandidateApproval'];
export type CandidateStatus = components['schemas']['CandidateReviewStatus'];
export type MapEventsResponse = components['schemas']['MapEventsResponse'];
export type NearbyEvent = components['schemas']['NearbyEvent'];
export type NearbyEventsResponse = components['schemas']['NearbyEventsResponse'];

export interface ApiErrorEnvelope {
  error?: { code?: string; message?: string; details?: unknown };
}
