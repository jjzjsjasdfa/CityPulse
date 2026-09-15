import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CategoryChips } from '../map/CategoryChips';
import { useMarkerLayout } from '../map/useMarkerLayout';
import { useNativeMarkerOffset } from '../map/useNativeMarkerOffset';
import { Platform, StyleSheet, View, useWindowDimensions } from 'react-native';
import MapView, { Circle, Marker, type MapMarker, type Region } from 'react-native-maps';

import type { EventCategory, MapEvent } from '../api/types';
import { EventMarker, markerHeight, markerLabelWidth } from '../map/EventMarker';
import { MapChrome, type MapScreenProps } from '../map/MapChrome';
import { boundsFromRegion, getMapLevel, getTimeSize, INITIAL_REGION, visibleMapPoints, viewportWidthKm, type MapDetail, type MapLevel } from '../map/presentation';
import { useMapDetail } from '../map/useMapDetail';
import { labelIds } from '../map/labelLayout';
import { useMapClock } from '../map/useMapClock';
import { regionAtDefaultScale } from '../map/geo';
import { EdgeGuidance } from '../map/EdgeGuidance';
import { LocationControls, UserLocationDot } from '../map/LocationControls';
import { categoryLabels, statusLabels } from '../theme';
import { DEMO_MODE, nearbyRadius } from '../demo';

const NativeEventMarker = memo(function NativeEventMarker({ point, dx, dy, level, detail, labelVisible, now, width, saved, unread, haloUntil, onSelectId }: {
  dx: number; dy: number;
  point: MapEvent; level: MapLevel; detail: MapDetail; labelVisible: boolean; now: number; width: number; saved: boolean; unread: boolean; haloUntil: number; onSelectId: (id: string) => void;
}) {
  const marker = useRef<MapMarker>(null);
  const [tracking, setTracking] = useState(true);
  const [haloActive, setHaloActive] = useState(false);
  useEffect(() => { setHaloActive(unread && haloUntil > Date.now()); const timer = setTimeout(() => setHaloActive(false), Math.max(0,haloUntil-Date.now())); return () => clearTimeout(timer); }, [unread,haloUntil]);
  const diameter = getTimeSize(point, now).diameter;
  useEffect(() => { if (!haloUntil) return; const timer = setTimeout(() => marker.current?.redraw(), Math.max(0, haloUntil-Date.now())+80); return () => clearTimeout(timer); }, [haloUntil]);
  useEffect(() => {
    setTracking(true);
    const timer = setTimeout(() => { marker.current?.redraw(); setTracking(false); }, 250);
    return () => clearTimeout(timer);
  }, [diameter, level, point.name, point.category, point.status, saved, unread, haloUntil, width, detail, labelVisible]);
  const height = markerHeight(level);
  const offset = useNativeMarkerOffset(marker,Math.round(dx),Math.round(dy),width,height);
  return (
    <Marker ref={marker} coordinate={{ latitude: point.latitude, longitude: point.longitude }}
      anchor={offset.anchor} centerOffset={offset.centerOffset}
      tracksViewChanges={tracking || (Platform.OS === 'android' && haloActive)} tracksInfoWindowChanges={false}
      accessibilityLabel={`${point.name}，${categoryLabels[point.category]}，${statusLabels[point.status]}`}
      onPress={() => onSelectId(point.id)} zIndex={saved ? 100 : diameter}>
      <EventMarker point={point} level={level} detail={detail} labelVisible={labelVisible} now={now} width={width} saved={saved} unread={unread} haloUntil={haloUntil} />
    </Marker>
  );
});

export function MapScreen({ session, unreadIds, haloUntil, onVisibleEvents, points, savedIds, onBoundsChange, onSelectId, position, locationStatus,
  onLocate, newEvents, onSeenEvents, ...state }: MapScreenProps) {
  const window = useWindowDimensions();
  const interacting = useRef(false);
  const insets = useSafeAreaInsets();
  const [hidden, setHidden] = useState(new Set<EventCategory>(session.hiddenCategories));
  const toggle = (category: EventCategory) => setHidden(current => { const next = new Set(current); next.has(category)?next.delete(category):next.add(category); session.hiddenCategories=[...next]; return next; });
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const [region, setRegion] = useState<Region>(() => session.region ?? regionAtDefaultScale(position ?? INITIAL_REGION, size));
  const viewport = useRef(region);
  const map = useRef<MapView>(null);
  const [ready, setReady] = useState(false);
  const centered = useRef(session.located);
  const now = useMapClock();
  const bounds = boundsFromRegion(region);
  const level = getMapLevel(bounds);
  const detail = useMapDetail(viewportWidthKm(bounds));
  const movementFrame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(movementFrame.current), []);
  const visible = useMemo(() => visibleMapPoints(points, boundsFromRegion(region), savedIds, now).filter(point => !hidden.has(point.category)), [points, region, savedIds, now, hidden]);
  const placements = useMarkerLayout(visible, region, size, savedIds, markerLabelWidth(size.width), detail.name > 0.5, level === 'names', insets.top + 70, insets.bottom + 90,interacting);
  const labels = labelIds(placements.map(item => item.point), region, size, savedIds, markerLabelWidth(size.width), detail.name > 0.5, now);
  const visibleKey = placements.map(item => item.point.id).join(',');
  const versionKey = placements.map(item => item.point.published_at ?? item.point.starts_at).join(',');
  useEffect(() => { onVisibleEvents(visibleKey ? visibleKey.split(',') : []); }, [visibleKey, versionKey, onVisibleEvents]);
  const movementTime = useRef(0);
  const updateRegion = (next: Region) => { session.region = next; viewport.current = next; setRegion(next); onBoundsChange(boundsFromRegion(next)); };
  const recenter = () => {
    if (!position) { onLocate(); return; }
    centered.current = true;
    session.located = true;
    const next = regionAtDefaultScale(position, size);
    map.current?.animateToRegion(next, 550);
    updateRegion(next);
  };
  useEffect(() => {
    if (!ready || !position || centered.current) return;
    centered.current = true;
    session.located = true;
    const next = regionAtDefaultScale(position, size);
    map.current?.animateToRegion(next, 550);
    updateRegion(next);
  }, [ready, position, size, onBoundsChange]);
  return (
    <View style={styles.container} onTouchStart={() => {interacting.current=true;}} onTouchEnd={() => {interacting.current=false;}} onTouchCancel={() => {interacting.current=false;}} onLayout={({ nativeEvent: { layout } }) => setSize({ width: layout.width, height: layout.height })}>
      <MapView ref={map} initialRegion={region} onMapReady={() => { setReady(true); onBoundsChange(boundsFromRegion(region)); }}
        onRegionChange={(next) => {
          viewport.current = next;
          session.region = next;
          // Camera motion stays native; collision layout need not rebuild at display refresh rate.
          if (Date.now()-movementTime.current >= 100 && !movementFrame.current) movementFrame.current = requestAnimationFrame(() => {
            movementTime.current = Date.now();
            movementFrame.current = 0; setRegion(viewport.current);
          });
        }}
        onRegionChangeComplete={updateRegion} rotateEnabled={false} pitchEnabled={false}
        moveOnMarkerPress={false} showsScale={Platform.OS === 'ios'} zoomControlEnabled={false} style={StyleSheet.absoluteFill}>
        {position && DEMO_MODE && nearbyRadius()>0 && <Circle center={position} radius={nearbyRadius()*1000} strokeColor="#38BDB6" strokeWidth={1.5} lineDashPattern={[6,7]} fillColor="transparent" />}
        {position && <Marker key="my-location" coordinate={position} anchor={{ x: 0.5, y: 0.5 }}
          centerOffset={{ x: 0, y: 0 }} title="我的位置" accessibilityLabel="我的位置" zIndex={1000} tracksViewChanges={false}>
          <UserLocationDot />
        </Marker>}
        {placements.map(({point,dx,dy}) => <NativeEventMarker key={point.id} point={point} dx={dx} dy={dy} level={level} detail={detail} labelVisible={labels.has(point.id)} now={now}
          width={markerLabelWidth(size.width)} saved={savedIds.has(point.id)} unread={unreadIds.has(point.id)} haloUntil={haloUntil[point.id] ?? 0} onSelectId={onSelectId} />)}
      </MapView>
      <MapChrome {...state} locationStatus={locationStatus} count={visible.length} level={level} />
      <CategoryChips shown={detail.name + detail.category > 0.4} hidden={hidden} toggle={toggle} top={insets.top + 8} />
      <LocationControls region={region} width={size.width} status={locationStatus} onRecenter={recenter} showScale={Platform.OS !== 'ios'} />
      <EdgeGuidance session={session} events={newEvents.filter(event => !hidden.has(event.category))} position={position} viewport={viewport} size={size} onSeen={onSeenEvents}
        renderedIds={new Set(placements.map(({point}) => point.id))} topInset={insets.top + 70} />
    </View>
  );
}

const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: '#DCE5DF' } });
