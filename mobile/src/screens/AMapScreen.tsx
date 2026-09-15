import { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { EventCategory } from '../api/types';
import { MapChrome, type MapScreenProps } from '../map/MapChrome';
import { CategoryChips } from '../map/CategoryChips';
import { useMarkerLayout } from '../map/useMarkerLayout';
import { labelIds } from '../map/labelLayout';
import { markerLabelWidth } from '../map/EventMarker';
import { boundsFromRegion, getMapLevel, getTimeSize, INITIAL_REGION, visibleMapPoints, viewportWidthKm } from '../map/presentation';
import { useMapDetail } from '../map/useMapDetail';
import { useMapClock } from '../map/useMapClock';
import { regionAtDefaultScale } from '../map/geo';
import { EdgeGuidance } from '../map/EdgeGuidance';
import { LocationControls } from '../map/LocationControls';
import { DEMO_MODE, nearbyRadius } from '../demo';
import { categoryColors, categoryLabels, signalColors } from '../theme';
import { AMapSurface } from '../map/amap/AMapSurface';
import { MAP_PAPER } from '../map/amap/config';
import { convertRegion, gcjToWgs, wgsToGcj } from '../map/amap/coordinates';
import type { AMapCommand, AMapMessage, AMapScene } from '../map/amap/types';

export function MapScreen({ session, unreadIds, haloUntil, onVisibleEvents, points, savedIds, onBoundsChange, onSelectId, position, locationStatus,
  onLocate, newEvents, onSeenEvents, ...state }: MapScreenProps) {
  const window = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const interacting = useRef(false);
  const [size, setSize] = useState({ width: window.width, height: window.height });
  const [hidden, setHidden] = useState(new Set<EventCategory>(session.hiddenCategories));
  const toggle = (category: EventCategory) => setHidden(current => {
    const next = new Set(current); next.has(category) ? next.delete(category) : next.add(category);
    session.hiddenCategories = [...next]; return next;
  });
  const [region, setRegion] = useState(() => session.region ?? regionAtDefaultScale(position ?? INITIAL_REGION, size));
  const [initialRegion] = useState(() => convertRegion(region, wgsToGcj));
  const viewport = useRef(region);
  const [ready, setReady] = useState(false);
  const [camera, setCamera] = useState<AMapCommand>();
  const cameraId = useRef(0);
  const centered = useRef(session.located);
  const now = useMapClock();
  const bounds = useMemo(() => boundsFromRegion(region), [region]);
  const level = getMapLevel(bounds);
  const detail = useMapDetail(viewportWidthKm(bounds));
  const visible = useMemo(() => visibleMapPoints(points, bounds, savedIds, now).filter(point => !hidden.has(point.category)), [points, bounds, savedIds, now, hidden]);
  const width = markerLabelWidth(size.width);
  const placements = useMarkerLayout(visible, region, size, savedIds, width, detail.name > .5, level === 'names', insets.top + 64, insets.bottom + 90, interacting);
  const labels = labelIds(placements.map(item => item.point), region, size, savedIds, width, detail.name > .5, now);
  const visibleKey = ready ? placements.map(item => item.point.id).join(',') : '';
  const versionKey = placements.map(item => item.point.published_at ?? item.point.starts_at).join(',');
  useEffect(() => { onVisibleEvents(visibleKey ? visibleKey.split(',') : []); }, [visibleKey, versionKey, onVisibleEvents]);
  const scene: AMapScene = {
    position: position ? wgsToGcj(position) : null,
    radius: DEMO_MODE ? nearbyRadius() : 0,
    pins: placements.map(({ point }) => ({
      ...wgsToGcj(point), id: point.id, name: point.name, category: categoryLabels[point.category],
      color: categoryColors[point.category], signal: signalColors[point.category],
      diameter: getTimeSize(point, now).diameter, width, saved: savedIds.has(point.id),
      unread: unreadIds.has(point.id), haloUntil: haloUntil[point.id] ?? 0,
      nameOpacity: labels.has(point.id) ? detail.name : 0,
      categoryOpacity: labels.has(point.id) ? detail.category : 0,
      opacity: (savedIds.has(point.id) ? 1 : detail.unsaved) * (['ended', 'cancelled', 'postponed'].includes(point.status) ? .65 : 1),
    })),
  };
  const recenter = () => {
    if (!position) { onLocate(); return; }
    centered.current = true; session.located = true;
    setCamera({ id: ++cameraId.current, region: convertRegion(regionAtDefaultScale(position, size), wgsToGcj) });
  };
  useEffect(() => { if (ready && position && !centered.current) recenter(); }, [ready, position, size]);
  const message = (event: AMapMessage) => {
    if (event.type === 'ready') setReady(true);
    else if (event.type === 'error') setReady(false);
    else if (event.type === 'interaction') interacting.current = event.active;
    else if (event.type === 'select') { if (ready && placements.some(({point}) => point.id === event.id)) onSelectId(event.id); }
    else if (event.type === 'camera') {
      const next = convertRegion(event.region, gcjToWgs);
      if (![next.latitude, next.longitude, next.latitudeDelta, next.longitudeDelta].every(Number.isFinite) || next.latitudeDelta <= 0 || next.longitudeDelta <= 0) return;
      session.region = next; viewport.current = next; setRegion(next);
      if (event.settled) onBoundsChange(boundsFromRegion(next));
    }
  };
  return <View style={styles.container} testID="event-map" onLayout={({nativeEvent:{layout}}) => setSize(old => old.width === layout.width && old.height === layout.height ? old : {width:layout.width,height:layout.height})}>
    <AMapSurface initialRegion={initialRegion} scene={scene} camera={camera} onMessage={message} />
    <MapChrome {...state} locationStatus={locationStatus} level={level} count={visible.length} />
    <CategoryChips shown={detail.name + detail.category > .4} hidden={hidden} toggle={toggle} top={insets.top + 8} />
    {ready && <LocationControls region={region} width={size.width} status={locationStatus} onRecenter={recenter} />}
    {ready && <EdgeGuidance session={session} events={newEvents.filter(event => !hidden.has(event.category))} position={position} viewport={viewport} size={size} onSeen={onSeenEvents}
      renderedIds={new Set(placements.map(({point}) => point.id))} topInset={insets.top + 64} />}
  </View>;
}
const styles = StyleSheet.create({ container: { flex: 1, backgroundColor: MAP_PAPER, overflow: 'hidden' } });
