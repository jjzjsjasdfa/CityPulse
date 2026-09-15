import type { Coordinate } from '../geo';
import type { MapRegion } from '../presentation';

export interface AMapPin extends Coordinate {
  id: string; name: string; category: string; color: string; signal: string;
  diameter: number; width: number; saved: boolean; unread: boolean; haloUntil: number;
  nameOpacity: number; categoryOpacity: number; opacity: number;
}
// All coordinates in this transport are GCJ-02. Application/API state is WGS84.
export interface AMapScene { pins: AMapPin[]; position: Coordinate | null; radius: number }
export type AMapMessage = { type: 'ready' } | { type: 'error'; message: string } |
  { type: 'camera'; region: MapRegion; settled: boolean } | { type: 'select'; id: string } |
  { type: 'interaction'; active: boolean };
export interface AMapCommand { id: number; region: MapRegion }
export interface AMapSurfaceProps {
  initialRegion: MapRegion; scene: AMapScene; camera?: AMapCommand;
  onMessage: (message: AMapMessage) => void;
}
