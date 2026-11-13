import type { NearbyEvent } from '../api/types';

export interface NearbyState { watermark: string | null; pending: NearbyEvent[]; seen: string[]; unread: NearbyEvent[]; viewed: string[] }
export const EMPTY_NEARBY: NearbyState = { watermark: null, pending: [], seen: [], unread: [], viewed: [] };
/** Builds the stable version key for a nearby event publication. */
export const updateKey = (event: NearbyEvent) => `${event.id}:${event.published_at}`;

/** Merges `incoming` events into persisted `state` at server watermark `checkedAt`. */
export function mergeNearby(state: NearbyState, incoming: NearbyEvent[], checkedAt: string, now: number): NearbyState {
  const seen = new Set(state.seen);
  const pending = new Map(state.pending.map((event) => [event.id, event]));
  const unread = new Map(state.unread.map((event) => [event.id, event]));
  const viewed = new Set(state.viewed);
  incoming.forEach((event) => { if (!seen.has(updateKey(event))) pending.set(event.id, event); });
  incoming.forEach((event) => { if (!viewed.has(updateKey(event))) unread.set(event.id, event); });
  return { watermark: checkedAt, seen: state.seen, viewed: state.viewed, unread: [...unread.values()].filter((event) => Date.parse(event.ends_at) > now), pending: [...pending.values()].filter((event) =>
    Date.parse(event.ends_at) > now && !['ended', 'cancelled', 'postponed'].includes(event.status)) };
}

/** Marks nearby event `id` as viewed and removes its pending/unread indicators. */
export function viewNearby(state: NearbyState, id: string): NearbyState {
  const viewed = new Set(state.viewed);
  state.unread.filter((event) => event.id === id).forEach((event) => viewed.add(updateKey(event)));
  return { ...acknowledgeNearby(state, [id]), unread: state.unread.filter((event) => event.id !== id), viewed: [...viewed].slice(-4000) };
}

/** Marks pending event `ids` as seen so overlapping polls do not alert again. */
export function acknowledgeNearby(state: NearbyState, ids: string[]): NearbyState {
  const idSet = new Set(ids);
  const seen = new Set(state.seen);
  state.pending.filter((event) => idSet.has(event.id)).forEach((event) => seen.add(updateKey(event)));
  // Only overlap at the latest server watermark can reappear on an incremental poll.
  return { ...state, seen: [...seen].slice(-4000), pending: state.pending.filter((event) => !idSet.has(event.id)) };
}

/** Safely parses stored JSON `value`, discarding malformed nearby-state entries. */
export function readNearbyState(value: string | null): NearbyState {
  try {
    const data = JSON.parse(value ?? '{}');
    return {
      watermark: typeof data.watermark === 'string' && Number.isFinite(Date.parse(data.watermark)) ? data.watermark : null,
      pending: Array.isArray(data.pending) ? data.pending.filter((event: NearbyEvent) => event &&
        typeof event.id === 'string' && Number.isFinite(event.latitude) && Number.isFinite(event.longitude) &&
        Number.isFinite(Date.parse(event.published_at)) && Number.isFinite(Date.parse(event.ends_at))) : [],
      seen: Array.isArray(data.seen) ? data.seen.filter((key: unknown) => typeof key === 'string').slice(-4000) : [],
      unread: Array.isArray(data.unread) ? data.unread.filter((event: NearbyEvent) => event && typeof event.id === 'string' && Number.isFinite(event.latitude) && Number.isFinite(event.longitude) && Number.isFinite(Date.parse(event.published_at)) && Number.isFinite(Date.parse(event.ends_at))) : [],
      viewed: Array.isArray(data.viewed) ? data.viewed.filter((key: unknown) => typeof key === 'string').slice(-4000) : [],
    };
  } catch { return EMPTY_NEARBY; }
}
