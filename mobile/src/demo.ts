export interface DebugSettings { enabled: boolean; time: string | null; radiusKm: number; monitor: boolean; cycleSeconds: number }
export const DEFAULT_SETTINGS: DebugSettings = { enabled: process.env.EXPO_PUBLIC_DEMO_MODE === '1', time: null, radiusKm: 7, monitor: true, cycleSeconds: 1 };
export let DEMO_MODE = DEFAULT_SETTINGS.enabled;
let settings = DEFAULT_SETTINGS;
let appliedAt = Date.now();
export function configureDebug(next: DebugSettings) { settings = next; DEMO_MODE = next.enabled; appliedAt = Date.now(); }
export function appNow() { return settings.enabled && settings.time ? Date.parse(settings.time) + Date.now() - appliedAt : Date.now(); }
export function nearbyRadius() { return settings.enabled ? settings.radiusKm : 7; }
export function markerCycleMs() { return (settings.enabled ? settings.cycleSeconds : 1) * 1000; }
export function demoQuery() { return DEMO_MODE ? `demo_now=${encodeURIComponent(new Date(appNow()).toISOString())}` : ''; }
export const DEMO_LOCATION = { latitude: 28.19409, longitude: 112.97667 };
export const storageKey = (key: string) => DEMO_MODE ? `@citypulse/demo/${key}` : `@citypulse/${key}`;
