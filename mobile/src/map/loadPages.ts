import type { MapEvent, MapEventsResponse } from '../api/types';

function checkAborted(signal?: AbortSignal) {
  // React Native's AbortController polyfill does not always expose throwIfAborted.
  if (signal?.aborted) throw Object.assign(new Error('地图请求已取消'), { name: 'AbortError' });
}

export async function loadMapPages(
  fetchPage: (offset: number) => Promise<MapEventsResponse>,
  signal?: AbortSignal,
  onPage?: (points: MapEvent[]) => void,
): Promise<MapEvent[]> {
  const points = new Map<string, MapEvent>();
  let offset = 0;
  while (true) {
    checkAborted(signal);
    const page = await fetchPage(offset);
    checkAborted(signal);
    page.data.forEach((point) => points.set(point.id, point));
    onPage?.([...points.values()]);
    if (!page.meta.has_next) return [...points.values()];
    if (page.meta.next_offset == null || page.meta.next_offset <= offset) throw new Error('地图分页未前进，请重试');
    offset = page.meta.next_offset;
  }
}
