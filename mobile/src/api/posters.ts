import { request } from './client';
export interface Reference { label: string; url: string }
export interface Artist {
  id: string; name: string; birth_date?: string | null; gender?: string; hometown?: string;
  aliases?: string[]; fan_name?: string; support_color?: string; agency?: string; honors?: string;
  works?: { name: string; language: string; category: string; released: string }[]; references?: Reference[];
}
export interface PosterFacts { name: string | null; organizer: string | null; time: string | null; place: string | null; artists: string[] }
export interface PosterResult {
  id: string; extracted: PosterFacts; raw_text: string; artists: Artist[];
  matches: {id: string; name: string; place: string; starts_at: string; score: number}[];
  auto_save_id: string | null; status: string; review_note: string | null; event_id?: string;
}
export const uploadPoster = (image_base64: string) => request<PosterResult>('/posters', {method:'POST',body:JSON.stringify({image_base64})});
export const posterHistory = () => request<PosterResult[]>('/posters');
export const getPoster = (id: string) => request<PosterResult>(`/posters/${id}`);
export const eventBackground = (id: string) => request<{artists: Artist[]; references: Reference[]}>(`/events/${id}/background`);
