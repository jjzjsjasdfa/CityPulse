import { request } from './client';
import type { Artist, Reference } from './posters';
export type EntryKind = 'person'|'organization'|'brand'|'place'|'event';
export type Entry = Artist & {kind:EntryKind;version:number;description?:string;references:Reference[]};
export type EntryLink = {field:string;text:string;entry:Entry|null;ambiguous:boolean};
export const kinds:Record<EntryKind,string>={person:'人物',organization:'主办方 / 机构',brand:'品牌',place:'地点',event:'活动'};
export type SearchEvent={id:string;name:string;place:string;starts_at:string};
export const searchEntries=(q:string,offset=0,kind?:EntryKind)=>request<{items:Entry[];has_more:boolean}>(`/entries?q=${encodeURIComponent(q)}&offset=${offset}${kind?`&kind=${kind}`:''}`);
export const searchEvents=(q:string,place='',offset=0)=>request<{items:SearchEvent[];has_more:boolean}>(`/event-search?q=${encodeURIComponent(q)}&place=${encodeURIComponent(place)}&offset=${offset}`);
export const saveFavorite=(id:string,saved=true,signal?:AbortSignal)=>request(`/favorites/${id}`,{method:saved?'PUT':'DELETE',signal});
export async function allFavorites(signal?:AbortSignal){const ids:string[]=[];let more=true;while(more){const page=await request<{ids:string[];has_more:boolean}>(`/favorites?offset=${ids.length}`,{signal});ids.push(...page.ids);more=page.has_more;}return ids;}
