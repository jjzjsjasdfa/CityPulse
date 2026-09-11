export const eventLink = (id: string) => `citypulse://event/${encodeURIComponent(id)}`;

export function eventIdFromLink(link: string): string | null {
  try {
    const url = new URL(link);
    if (url.protocol !== 'citypulse:' || url.hostname !== 'event' || url.search || url.hash) return null;
    const id = decodeURIComponent(url.pathname.slice(1));
    return /^[a-zA-Z0-9_-]{1,128}$/.test(id) ? id : null;
  } catch {
    return null;
  }
}
