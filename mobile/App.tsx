import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { demoURL, getEvent, listEvents, submitCorrection } from './src/api/client';
import { configureDebug, DEFAULT_SETTINGS, DEMO_MODE, nearbyRadius, storageKey, type DebugSettings } from './src/demo';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useActivityAlerts } from './src/map/useActivityAlerts';
import { PerformanceMonitor } from './src/map/PerformanceMonitor';
import Svg, { Circle, Path } from 'react-native-svg';
import type { EventDetail, EventSummary } from './src/api/types';
import { DetailSheet } from './src/components/DetailSheet';
import type { FilterValue } from './src/components/FilterBar';
import { FALLBACK_EVENTS, fallbackDetail } from './src/data/fallback';
import { eventIdFromLink } from './src/eventLinks';
import { boundsFromRegion, INITIAL_REGION, toMapPoint, type MapBounds, type MapSession } from './src/map/presentation';
import { useMapEvents } from './src/map/useMapEvents';
import { useDeviceLocation } from './src/map/useDeviceLocation';
import { useNearbyUpdates } from './src/map/useNearbyUpdates';
import { FeedScreen } from './src/screens/FeedScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SavedScreen } from './src/screens/SavedScreen';
import { colors } from './src/theme';

type Tab = 'feed' | 'map' | 'saved' | 'settings';
const SETTINGS_KEY = '@citypulse/settings-v1';

export default function App() {
  const [settings, setSettings] = useState<DebugSettings | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => { void AsyncStorage.getItem(SETTINGS_KEY).then((value) => {
    let next = DEFAULT_SETTINGS;
    try { const saved = JSON.parse(value ?? 'null'); if (typeof saved?.enabled === 'boolean') next = { enabled: saved.enabled, time: typeof saved.time === 'string' && Number.isFinite(Date.parse(saved.time)) ? saved.time : null,
      radiusKm: Number.isFinite(saved.radiusKm) ? (saved.radiusKm === 15 && saved.cycleSeconds == null ? 7 : Math.max(0,Math.min(30,saved.radiusKm))) : 7, monitor: saved.monitor !== false,
      cycleSeconds: Number.isFinite(saved.cycleSeconds) ? Math.max(0.5, Math.min(5, saved.cycleSeconds)) : 1 }; } catch {}
    configureDebug(next); setSettings(next);
  }).catch(() => { configureDebug(DEFAULT_SETTINGS); setSettings(DEFAULT_SETTINGS); }); }, []);
  const apply = async (next: DebugSettings, replay = false) => {
    await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    // Unmount old subscriptions before switching clock, API and storage namespace.
    setSettings(null);
    await new Promise((resolve) => setTimeout(resolve, 0));
    configureDebug(next);
    try { if (next.enabled) {
      // Rewinding time invalidates an incremental-query watermark.
      if (replay || settings?.time !== next.time) await AsyncStorage.multiRemove([storageKey('nearby-updates-v2'), storageKey('activity-alerts-v1')]);
      else if (settings?.radiusKm !== next.radiusKm) {
        const raw = await AsyncStorage.getItem(storageKey('nearby-updates-v2'));
        if (raw) { const record = JSON.parse(raw); record.watermark = null; await AsyncStorage.setItem(storageKey('nearby-updates-v2'), JSON.stringify(record)); }
      }
      if (replay) {
        try { const response = await fetch(demoURL('/demo/publish'), { method: 'POST' }); if (!response.ok) throw new Error(); }
        catch { Alert.alert('测试服务未连接', '设置已应用，模拟发布失败。请启动测试 API 后重试。'); }
      }
    } } finally { setRevision((r) => r + 1); setSettings(next); }
  };
  if (!settings) return <View style={{ flex: 1, backgroundColor: colors.paper }} />;
  return <SafeAreaProvider><CityPulse key={revision} settings={settings} onApplySettings={apply} /></SafeAreaProvider>;
}

function CityPulse({ settings, onApplySettings }: { settings: DebugSettings; onApplySettings: (settings: DebugSettings, replay?: boolean) => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [SAVED_KEY] = useState(() => storageKey('saved-events'));
  const [SAVED_DATA_KEY] = useState(() => storageKey('saved-event-data'));
  const [tab, setTab] = useState<Tab>('map');
  const mapSession = useRef<MapSession>({ located: false });
  const [filter, setFilter] = useState<FilterValue>('all');
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [knownEvents, setKnownEvents] = useState<EventSummary[]>([]);
  const [mapBounds, setMapBounds] = useState<MapBounds>(boundsFromRegion(INITIAL_REGION));
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedReady, setSavedReady] = useState(false);
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [offline, setOffline] = useState(true);
  const location = useDeviceLocation();
  const nearby = useNearbyUpdates(location.status === 'ready' ? location.position : null, tab === 'map');
  useEffect(() => { if (detail) nearby.view(detail.id); }, [detail?.id, nearby.unread, nearby.view]);
  const mapData = useMapEvents(mapBounds, tab === 'map');
  const mapPoints = useMemo(() => {
    const base = mapData.offline && nearby.points.length ? [] : mapData.points;
    const merged = new Map(base.map((point) => [point.id, point]));
    nearby.points.forEach((point) => merged.set(point.id, point));
    knownEvents.filter((event) => savedIds.has(event.id) && !merged.has(event.id)).forEach((event) => merged.set(event.id, toMapPoint(event)));
    return [...merged.values()];
  }, [mapBounds, knownEvents, savedIds, mapData.points, mapData.offline, nearby.points]);
  const alerts = useActivityAlerts(mapPoints, location.status === 'ready' ? location.position : null);
  useEffect(() => { if (detail) alerts.view(detail.id); }, [detail?.id, mapPoints, alerts.view]);
  const completedKey = alerts.completedIds.join(',');
  useEffect(() => { if (completedKey) nearby.acknowledge(completedKey.split(',')); }, [completedKey, nearby.acknowledge]);

  useEffect(() => {
    let active = true;
    let request = 0;
    const openSharedEvent = async (url: string | null) => {
      const id = url ? eventIdFromLink(url) : null;
      if (!id) return;
      const current = ++request;
      const demo = DEMO_MODE ? FALLBACK_EVENTS.find((event) => event.id === id) : undefined;
      setTab('feed');
      setDetail(demo ? fallbackDetail(demo) : null);
      setDetailLoading(!demo);
      if (demo) return;
      try {
        const event = await getEvent(id);
        if (active && current === request) {
          setDetail(event);
          setKnownEvents((events) => [...events.filter((item) => item.id !== event.id), event]);
        }
      } catch {
        if (active && current === request) Alert.alert('无法打开活动', '活动可能已下架，或网络暂时不可用。请稍后重新打开链接。');
      } finally {
        if (active && current === request) setDetailLoading(false);
      }
    };
    const subscription = Linking.addEventListener('url', ({ url }) => { void openSharedEvent(url); });
    void Linking.getInitialURL().then((url) => {
      if (active && request === 0) void openSharedEvent(url);
    }).catch(() => undefined);
    return () => { active = false; subscription.remove(); };
  }, []);

  useEffect(() => {
    AsyncStorage.multiGet([SAVED_KEY, SAVED_DATA_KEY]).then(async (entries) => {
      const values = new Map(entries);
      if (DEMO_MODE && values.get(SAVED_KEY) === null) {
        const response = await fetch(demoURL('/demo'));
        if (response.ok) {
          const data = await response.json() as { saved_ids: string[] };
          const examples = await Promise.all(data.saved_ids.map((id) => getEvent(id)));
          setSavedIds(new Set(data.saved_ids));
          setKnownEvents((current) => [...current, ...examples]);
          return;
        }
      }
      const ids: unknown = JSON.parse(values.get(SAVED_KEY) ?? '[]');
      if (Array.isArray(ids)) setSavedIds(new Set(ids.filter((id): id is string => typeof id === 'string')));
      const cached: unknown = JSON.parse(values.get(SAVED_DATA_KEY) ?? '[]');
      if (Array.isArray(cached)) setKnownEvents((current) => {
        const merged = new Map(current.map((event) => [event.id, event]));
        cached.filter((event) => event?.id && event?.location && event?.ends_at && (DEMO_MODE || !event.is_demo))
          .forEach((event: EventSummary) => merged.set(event.id, event));
        return [...merged.values()];
      });
    }).catch(() => undefined).finally(() => setSavedReady(true));
  }, []);

  useEffect(() => {
    if (!savedReady) return;
    void AsyncStorage.multiSet([
      [SAVED_KEY, JSON.stringify([...savedIds])],
      [SAVED_DATA_KEY, JSON.stringify(knownEvents.filter((event) => savedIds.has(event.id)))],
    ]).catch(() => undefined);
  }, [savedReady, savedIds, knownEvents]);

  useEffect(() => {
    if (!savedReady) return;
    const controller = new AbortController();
    const missing = [...savedIds].filter((id) => !knownEvents.some((event) => event.id === id));
    // Older installs only persisted IDs. Restore their coordinates with bounded concurrency.
    void Promise.all(Array.from({ length: Math.min(4, missing.length) }, async () => {
      while (missing.length && !controller.signal.aborted) {
        const id = missing.shift()!;
        try {
          const event = await getEvent(id, controller.signal);
          if (!controller.signal.aborted) setKnownEvents((current) =>
            [...current.filter((item) => item.id !== event.id), event]);
        } catch { /* Keep the ID so unavailable favorites can be restored later. */ }
      }
    }));
    return () => controller.abort();
    // Snapshot known events when favorites change; do not restart workers after each response.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedReady, savedIds]);

  const load = useCallback(async (nextFilter: FilterValue) => {
    setLoading(true);
    try {
      const page = await listEvents({
        category: !['all', 'newest', 'ending_soon'].includes(nextFilter) ? nextFilter : undefined,
        sort: nextFilter === 'newest' ? 'newest' : nextFilter === 'ending_soon' ? 'ending_soon' : 'soonest',
      });
      setEvents(page.data);
      setKnownEvents((current) => {
        const merged = new Map(current.map((event) => [event.id, event]));
        page.data.forEach((event) => merged.set(event.id, event));
        return [...merged.values()];
      });
      setOffline(false);
    } catch {
      setEvents([]);
      setOffline(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load('all');
  }, [load]);

  const changeFilter = (nextFilter: FilterValue) => {
    setFilter(nextFilter);
    void load(nextFilter);
  };

  const toggleSaved = (id: string) => {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const openSummary = async (event: EventSummary) => {
    setDetail(fallbackDetail(event));
    if (offline) {
      setDetailLoading(false);
      return;
    }
    setDetailLoading(true);
    try {
      setDetail(await getEvent(event.id));
      setOffline(false);
    } catch {
      // The local detail remains usable when the API is offline.
    } finally {
      setDetailLoading(false);
    }
  };

  const openId = async (id: string) => {
    const summary = knownEvents.find((event) => event.id === id);
    if (summary) {
      await openSummary(summary);
      return;
    }
    setDetailLoading(true);
    try {
      const event = await getEvent(id);
      setDetail(event);
      setKnownEvents((current) => [...current.filter((item) => item.id !== id), event]);
    } catch {
      Alert.alert('无法打开活动', '网络暂时不可用，请稍后重试。');
    } finally {
      setDetailLoading(false);
    }
  };

  const tabs = useMemo(
    () => [
      { id: 'feed' as const, icon: '⌁', label: '发现' },
      { id: 'map' as const, icon: '⌖', label: '探索' },
      { id: 'saved' as const, icon: '♙', label: '我的' },
    ],
    [],
  );

  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={[styles.content, tab !== 'map' && { paddingTop: insets.top, paddingBottom: 90 + insets.bottom }]}>
        {tab === 'settings' && <SettingsScreen settings={settings} onApply={onApplySettings} onBack={() => setTab('saved')} />}
        {tab === 'feed' && (
          <FeedScreen
            events={events}
            filter={filter}
            loading={loading}
            offline={offline}
            savedIds={savedIds}
            onFilterChange={changeFilter}
            onRefresh={() => load(filter)}
            onSelect={openSummary}
            onToggleSaved={toggleSaved}
          />
        )}
        {tab === 'map' && (
          <MapScreen
            session={mapSession.current}
            points={mapPoints} savedIds={savedIds} loading={mapData.loading}
            offline={mapData.offline && !nearby.points.length}
            incomplete={mapData.incomplete || (mapData.offline && nearby.points.length > 0)}
            onBoundsChange={setMapBounds} onSelectId={openId}
            position={location.status === 'ready' ? location.position : null} locationStatus={location.status} onLocate={location.retryLocation}
            newEvents={nearby.events} onSeenEvents={nearby.acknowledge} updatesUnavailable={nearby.unavailable}
            unreadIds={alerts.unreadIds} haloUntil={alerts.haloUntil} onVisibleEvents={alerts.onVisible}
            onDemoPublished={nearby.refresh}
          />
        )}
        {tab === 'saved' && (
          <SavedScreen
            onSettings={() => setTab('settings')}
            events={knownEvents}
            savedIds={savedIds}
            onSelect={openSummary}
            onToggleSaved={toggleSaved}
          />
        )}
      </View>
      <View style={[styles.tabBar, { bottom: Math.max(12, insets.bottom + 6) }]}>
        {tabs.map((item) => {
          const active = tab === item.id || (tab === 'settings' && item.id === 'saved');
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={item.id}
              onPress={() => setTab(item.id)}
              style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
            >
              <Svg width={24} height={24} viewBox="0 0 24 24" stroke={active ? colors.orange : '#7B8C89'} strokeWidth={1.8} fill="none" strokeLinecap="round" strokeLinejoin="round">
                {item.id === 'saved' ? <><Circle cx={12} cy={7} r={4}/><Path d="M4 22v-3a8 8 0 0 1 16 0v3"/></> : item.id === 'map' ?
                  <><Circle cx={12} cy={12} r={9}/><Path d="m16 8-2.5 5.5L8 16l2.5-5.5Z"/></> :
                  <><Path d="M4 3h6v8H4zM14 3h6v5h-6zM4 15h6v6H4zM14 12h6v9h-6z"/></>}
              </Svg>
              <Text style={[styles.tabLabel, active && styles.tabActive]}>{item.label}</Text>
            </Pressable>
          );
        })}
      </View>
      <DetailSheet
        key={detail?.id ?? 'closed'}
        event={detail}
        loading={detailLoading}
        saved={detail ? savedIds.has(detail.id) : false}
        onClose={() => setDetail(null)}
        onToggleSaved={() => detail && toggleSaved(detail.id)}
        onSubmitCorrection={(message) =>
          detail ? submitCorrection({ event_id: detail.id, kind: 'other', message }) : Promise.resolve()
        }
      />
      {settings.enabled && settings.monitor && <PerformanceMonitor visible={tab === 'map'} />}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1 },
  tabBar: {
    position: 'absolute', left: 24, right: 24, height: 64,
    backgroundColor: 'rgba(255,255,255,0.94)', borderRadius: 32,
    borderColor: 'rgba(220,229,225,0.7)', borderWidth: 1,
    shadowColor: '#183A35', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 6 }, elevation: 8,
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingBottom: 5,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { color: '#7B8C89', fontSize: 25, lineHeight: 27 },
  tabLabel: { color: '#7B8C89', fontSize: 11, fontWeight: '800', marginTop: 2 },
  tabActive: { color: colors.orange },
});
