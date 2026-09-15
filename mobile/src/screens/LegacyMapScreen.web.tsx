import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryChips } from '../map/CategoryChips';
import { useMarkerLayout } from '../map/useMarkerLayout';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import * as L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { EventCategory, MapEvent } from '../api/types';
import { EventMarker, markerLabelWidth } from '../map/EventMarker';
import { MapChrome, type MapScreenProps } from '../map/MapChrome';
import { boundsFromRegion, getMapLevel, INITIAL_REGION, normalizeLongitude, visibleMapPoints, viewportWidthKm, type MapDetail, type MapLevel } from '../map/presentation';
import { useMapClock } from '../map/useMapClock';
import { useMapDetail } from '../map/useMapDetail';
import { labelIds } from '../map/labelLayout';
import { regionAtDefaultScale } from '../map/geo';
import { EdgeGuidance } from '../map/EdgeGuidance';
import { LocationControls, UserLocationDot } from '../map/LocationControls';
import { categoryLabels, colors } from '../theme';
import { DEMO_MODE, nearbyRadius } from '../demo';

type TapPoint = { x: number; y: number };
type MapPress = { start: TapPoint; end: TapPoint; cancelled: boolean; at: number };
const presses = new WeakMap<L.Map, MapPress>();

function observePresses(map: L.Map) {
  const element = map.getContainer();
  const start = (x: number, y: number, multiple = false) => presses.set(map, {
    start: { x, y }, end: { x, y }, cancelled: multiple, at: Date.now(),
  });
  const move = (x: number, y: number, multiple = false) => {
    const press = presses.get(map);
    if (!press) return;
    press.end = { x, y }; press.at = Date.now();
    press.cancelled ||= multiple || Math.hypot(x - press.start.x, y - press.start.y) > 6;
  };
  const down = (event: PointerEvent) => start(event.clientX, event.clientY);
  const update = (event: PointerEvent) => move(event.clientX, event.clientY);
  const cancel = () => { const press = presses.get(map); if (press) press.cancelled = true; };
  // Mobile browsers can retarget a synthetic click to a nearby link. Keep the
  // original finger coordinates, before that touch-target adjustment occurs.
  const touchStart = (event: TouchEvent) => {
    const touch = event.touches[0]; if (touch) start(touch.clientX, touch.clientY, event.touches.length > 1);
  };
  const touchUpdate = (event: TouchEvent) => {
    const touch = event.changedTouches[0]; if (touch) move(touch.clientX, touch.clientY, event.touches.length > 1);
  };
  element.addEventListener('pointerdown', down, true);
  element.addEventListener('pointermove', update, true);
  element.addEventListener('pointerup', update, true);
  element.addEventListener('pointercancel', cancel, true);
  element.addEventListener('touchstart', touchStart, { capture: true, passive: true });
  element.addEventListener('touchmove', touchUpdate, { capture: true, passive: true });
  element.addEventListener('touchend', touchUpdate, { capture: true, passive: true });
  return () => {
    element.removeEventListener('pointerdown', down, true);
    element.removeEventListener('pointermove', update, true);
    element.removeEventListener('pointerup', update, true);
    element.removeEventListener('pointercancel', cancel, true);
    element.removeEventListener('touchstart', touchStart, true);
    element.removeEventListener('touchmove', touchUpdate, true);
    element.removeEventListener('touchend', touchUpdate, true);
    presses.delete(map);
  };
}

function EventPin({ map, point, dx, dy, width, level, detail, labelVisible, now, saved, unread, haloUntil, onSelect }: {
  dx: number; dy: number;
  map: L.Map; point: MapEvent; width: number; level: MapLevel; detail: MapDetail;
  now: number; saved: boolean; unread: boolean; haloUntil: number; labelVisible: boolean; onSelect: (id: string) => void;
}) {
  const host = useMemo(() => document.createElement('div'), []);
  const selected = useRef(onSelect);
  selected.current = onSelect;
  useEffect(() => { host.style.transition = 'transform 180ms ease-out'; host.style.transform = `translate(${dx}px, ${dy}px)`; }, [host,dx,dy]);
  useEffect(() => {
    host.dataset.testid = `event-marker-${point.id}`;
    host.style.animation = 'citypulse-enter 240ms ease-out';
    host.style.position = 'relative'; host.style.left = `${22 - width / 2}px`;
    host.style.pointerEvents = 'none';
    const marker = L.marker([point.latitude, point.longitude], {
      icon: L.divIcon({ html: host, className: 'citypulse-marker', iconSize: [44, 44], iconAnchor: [22, 22] }),
      title: `${point.name}，${categoryLabels[point.category]}`, keyboard: true,
      riseOnHover: false, zIndexOffset: saved ? 1000 : 0, bubblingMouseEvents: true,
    }).addTo(map);
    const icon = marker.getElement();
    icon?.setAttribute('aria-label', `查看${point.name}`);
    if (icon) icon.style.pointerEvents = 'none';
    marker.on('click', (event: L.LeafletMouseEvent) => {
      const target = event.originalEvent.target;
      if (!(target instanceof Element)) return;
      const hit = target.closest('[data-testid^="event-dot-"], [data-testid^="name-label-"], [data-testid^="category-label-"]');
      if (!hit || !icon?.contains(hit)) return;
      const press = presses.get(map);
      if (press && Date.now() - press.at < 1000) {
        if (press.cancelled) return;
        const box = hit.getBoundingClientRect();
        const inside = (p: TapPoint) => hit.getAttribute('data-testid')?.startsWith('event-dot-') ?
          Math.hypot(p.x - box.x - box.width / 2, p.y - box.y - box.height / 2) <= Math.min(box.width, box.height) / 2 :
          p.x >= box.left && p.x <= box.right && p.y >= box.top && p.y <= box.bottom;
        if (!inside(press.start) || !inside(press.end)) return;
      }
      // Opacity alone does not disable DOM hit testing. Check the animated
      // ancestors too, so a label fading in/out cannot leave an invisible target.
      for (let node: Element | null = hit; node && node !== icon; node = node.parentElement) {
        if (Number(getComputedStyle(node).opacity) < 0.5) return;
      }
      selected.current(point.id);
    });
    marker.on('keydown', (event: L.LeafletKeyboardEvent) => {
      if (event.originalEvent.key === 'Enter' || event.originalEvent.key === ' ') {
        L.DomEvent.stop(event.originalEvent); selected.current(point.id);
      }
    });
    return () => { marker.remove(); };
  }, [map, host, point.id, point.latitude, point.longitude, point.name, point.category, width, saved]);
  return createPortal(<EventMarker point={point} width={width} level={level} detail={detail} labelVisible={labelVisible} now={now} saved={saved} unread={unread} haloUntil={haloUntil} interactive />, host);
}
function OwnLocation({ map, latitude, longitude }: { map: L.Map; latitude: number; longitude: number }) {
  const host = useMemo(() => document.createElement('div'), []);
  const marker = useRef<L.Marker | null>(null);
  useEffect(() => {
    if (!DEMO_MODE || nearbyRadius()<=0) return;
    const circle=L.circle([latitude,longitude],{radius:nearbyRadius()*1000,color:'#38BDB6',weight:1.5,dashArray:'6 7',fill:false,interactive:false}).addTo(map);
    return ()=>{circle.remove();};
  }, [map,latitude,longitude]);
  useEffect(() => {
    host.dataset.testid = 'my-location'; host.setAttribute('aria-label', '我的位置');
    marker.current = L.marker([latitude, longitude], { interactive: false, zIndexOffset: 2000,
      icon: L.divIcon({ html: host, className: 'citypulse-position', iconSize: [32, 32], iconAnchor: [16, 16] }) }).addTo(map);
    return () => { marker.current?.remove(); };
  }, [map, host]);
  useEffect(() => { marker.current?.setLatLng([latitude, longitude]); }, [latitude, longitude]);
  return createPortal(<UserLocationDot />, host);
}
export function MapScreen({ session, unreadIds, haloUntil, onVisibleEvents, points, savedIds, onBoundsChange, onSelectId, position, locationStatus,
  onLocate, newEvents, onSeenEvents, ...state }: MapScreenProps) {
  const container = useRef<HTMLDivElement>(null);
  const interacting = useRef(false);
  const insets = useSafeAreaInsets();
  const [hidden, setHidden] = useState(new Set<EventCategory>(session.hiddenCategories));
  const toggle = (category: EventCategory) => setHidden(current => { const next = new Set(current); next.has(category)?next.delete(category):next.add(category); session.hiddenCategories=[...next]; return next; });
  const [map, setMap] = useState<L.Map | null>(null);
  const [size, setSize] = useState({ width: 390, height: 772 });
  const [region, setRegion] = useState(() => session.region ?? regionAtDefaultScale(position ?? INITIAL_REGION, size));
  const viewport = useRef(region);
  const centered = useRef(session.located);
  const boundsCallback = useRef(onBoundsChange);
  boundsCallback.current = onBoundsChange;
  const [touch, setTouch] = useState(true);
  const [tilesLoading, setTilesLoading] = useState(false);
  const [tilesFailed, setTilesFailed] = useState(false);
  const now = useMapClock();
  const bounds = useMemo(() => boundsFromRegion(region), [region]);
  const level = getMapLevel(bounds);
  const detail = useMapDetail(viewportWidthKm(bounds));
  const visible = useMemo(() => visibleMapPoints(points, bounds, savedIds, now).filter(point => !hidden.has(point.category)), [points,bounds,savedIds,now,hidden]);
  const placements = useMarkerLayout(visible, region, size, savedIds, markerLabelWidth(size.width), detail.name > 0.5, level === 'names', insets.top+64,insets.bottom+90,interacting);
  const labels = labelIds(placements.map(item => item.point), region, size, savedIds, markerLabelWidth(size.width), detail.name > 0.5, now);
  const visibleKey = placements.map(item => item.point.id).join(',');
  const versionKey = placements.map(item => item.point.published_at ?? item.point.starts_at).join(',');
  useEffect(() => { onVisibleEvents(visibleKey ? visibleKey.split(',') : []); }, [visibleKey,versionKey,onVisibleEvents]);
  useEffect(() => {
    const media = matchMedia('(any-pointer: coarse)');
    const update = () => setTouch(navigator.maxTouchPoints > 0 || media.matches);
    update(); media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  useEffect(() => {
    if (!container.current) return;
    const view = L.map(container.current, { zoomControl: false, attributionControl: true,
      zoomSnap: 0, zoomDelta: 0.5, minZoom: 3, maxZoom: 19, touchZoom: true,
      wheelPxPerZoomLevel: 160, zoomAnimation: true, fadeAnimation: true });
    const stopObservingPresses = observePresses(view);
    const tiles = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 19,
      updateWhenIdle: true, updateWhenZooming: false,
    });
    tiles.on('loading', () => { setTilesLoading(true); setTilesFailed(false); });
    tiles.on('load', () => setTilesLoading(false));
    tiles.on('tileerror', () => setTilesFailed(true));
    tiles.addTo(view);
    const initial = session.region ?? regionAtDefaultScale(position ?? INITIAL_REGION, { width: container.current.clientWidth, height: container.current.clientHeight });
    const b = boundsFromRegion(initial);
    view.fitBounds([[b.south, b.west], [b.north, b.east]], { animate: false });
    setMap(view);
    let frame = 0;
    const readRegion = () => {
      const box = view.getBounds(), center = view.getCenter();
      return { latitude: center.lat, longitude: normalizeLongitude(center.lng),
        latitudeDelta: box.getNorth() - box.getSouth(), longitudeDelta: Math.min(360, box.getEast() - box.getWest()) };
    };
    const update = () => {
      viewport.current = readRegion();
      session.region = viewport.current;
      if (!frame) frame = requestAnimationFrame(() => {
        frame = 0; setRegion(viewport.current);
        const next = view.getSize(); setSize((old) => old.width === next.x && old.height === next.y ? old : { width: next.x, height: next.y });
      });
    };
    const settled = () => { update(); boundsCallback.current(boundsFromRegion(readRegion())); };
    view.on('move zoom', update).on('moveend', settled);
    view.on('zoomanim', (event: L.ZoomAnimEvent) => {
      const current = readRegion(), scale = view.getZoomScale(event.zoom);
      setRegion({ ...current, longitudeDelta: current.longitudeDelta / scale, latitudeDelta: current.latitudeDelta / scale });
    });
    const observer = new ResizeObserver(() => view.invalidateSize());
    observer.observe(container.current); settled();
    return () => {
      session.region = readRegion();
      // Logout/provider changes can unmount while an animated recenter is active.
      // Detach camera listeners before stopping the map so they cannot read a
      // removed Leaflet pane from a final animation event.
      view.off('move zoom', update).off('moveend', settled).off('zoomanim');
      stopObservingPresses(); observer.disconnect(); cancelAnimationFrame(frame);
      // Leaflet 1.9's CSS zoom fallback timer is not cancelled by stop/remove.
      // Its callback checks this flag before accessing the removed map pane.
      (view as L.Map & { _animatingZoom: boolean })._animatingZoom = false;
      view.stop(); view.remove();
    };
  }, []);
  const recenter = () => {
    if (!position) { onLocate(); return; }
    if (!map) return;
    const b = boundsFromRegion(regionAtDefaultScale(position, size));
    map.fitBounds([[b.south, b.west], [b.north, b.east]], { animate: true, duration: 0.5 });
  };
  useEffect(() => {
    if (!map || !position || centered.current) return;
    centered.current = true; session.located = true; recenter();
  }, [map, position, size]);
  return <View style={styles.container} testID="event-map" onPointerDown={() => {interacting.current=true;}} onPointerUp={() => {interacting.current=false;}} onPointerCancel={() => {interacting.current=false;}}>
    <style>{`@keyframes citypulse-enter { from { opacity:0 } to { opacity:1 } }
      @keyframes citypulse-halo-life { 0%,98% {opacity:1} 100% {opacity:0} }
      @keyframes citypulse-halo-pulse { 0% {transform:scale(.05);opacity:0} 15% {opacity:1} 75% {opacity:1} 100% {transform:scale(1);opacity:0} }
      .citypulse-halo-life { animation:citypulse-halo-life 60s linear both; }
      .citypulse-halo-pulse { animation:citypulse-halo-pulse 2.4s ease-out infinite; }
      @media (prefers-reduced-motion:reduce) { .citypulse-halo-pulse {animation:none;opacity:.4} }
      .leaflet-container { background:#e4eadd; font-family:inherit; }
      .leaflet-control-attribution { font-size:9px!important; }
      .citypulse-marker { border:0; background:transparent; }
      .citypulse-marker [data-testid^="event-dot-"] { clip-path:circle(50%); cursor:pointer; }
      .citypulse-marker [data-testid^="name-label-"], .citypulse-marker [data-testid^="category-label-"] { cursor:pointer; }
      .citypulse-position { pointer-events:none; }`}</style>
    <div ref={container} style={{ position: 'absolute', inset: 0, zIndex: 0 }} aria-label="活动地图" />
    {map && placements.map(({point,dx,dy}) => <EventPin key={point.id} map={map} point={point} dx={dx} dy={dy} width={markerLabelWidth(size.width)}
      level={level} detail={detail} labelVisible={labels.has(point.id)} now={now} saved={savedIds.has(point.id)} unread={unreadIds.has(point.id)} haloUntil={haloUntil[point.id] ?? 0} onSelect={onSelectId} />)}
    {map && position && <OwnLocation map={map} latitude={position.latitude} longitude={position.longitude} />}
    {!touch && <View style={styles.zoom}>
      <Pressable accessibilityRole="button" accessibilityLabel="放大地图" style={styles.zoomButton} onPress={() => map?.zoomIn(0.5)}><Text style={styles.symbol}>＋</Text></Pressable>
      <Pressable accessibilityRole="button" accessibilityLabel="缩小地图" style={styles.zoomButton} onPress={() => map?.zoomOut(0.5)}><Text style={styles.symbol}>−</Text></Pressable>
    </View>}
    <MapChrome {...state} locationStatus={locationStatus} level={level} count={visible.length} />
    <CategoryChips shown={detail.name + detail.category > 0.4} hidden={hidden} toggle={toggle} top={insets.top+8} />
    <LocationControls region={region} width={size.width} status={locationStatus} onRecenter={recenter} />
    {(tilesLoading || tilesFailed) && <Text pointerEvents="none" style={styles.tileStatus}>{tilesLoading ? '底图加载中…' : '底图未完整加载 · 轻移地图重试'}</Text>}
      <EdgeGuidance session={session} events={newEvents.filter(event => !hidden.has(event.category))} position={position} viewport={viewport} size={size} onSeen={onSeenEvents}
      renderedIds={new Set(placements.map(({point}) => point.id))} topInset={insets.top+64} />
  </View>;
}
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DFE8E0', overflow: 'hidden' },
  zoom: { position: 'absolute', right: 18, top: 120, backgroundColor: colors.white, borderRadius: 14, borderWidth: 1, borderColor: colors.line },
  zoomButton: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  symbol: { color: colors.ink, fontSize: 24 },
  tileStatus: { position: 'absolute', left: 18, bottom: 72, fontSize: 10, color: colors.inkMuted, backgroundColor: 'rgba(255,253,248,0.9)', padding: 5, borderRadius: 6 },
});
