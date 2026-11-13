/** Builds the app deep link for event `id`. */
export const eventLink = (id: string) => `citypulse://event/${encodeURIComponent(id)}`;
