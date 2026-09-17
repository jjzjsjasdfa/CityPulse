import AsyncStorage from '@react-native-async-storage/async-storage';
import {allFavorites,saveFavorite} from './src/api/knowledge';
import {KnowledgeProvider} from './src/components/Knowledge';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearSession, demoURL, getEvent, listEvents, setAuthHandler, signOut, submitCorrection } from './src/api/client';
import { configureDebug, DEFAULT_SETTINGS, DEMO_MODE, storageKey, type DebugSettings } from './src/demo';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { useActivityAlerts } from './src/map/useActivityAlerts';
import { PerformanceMonitor } from './src/map/PerformanceMonitor';
import Svg, { Circle, Path } from 'react-native-svg';
import type { EventDetail, EventSummary, LoginResponse } from './src/api/types';
import { DetailSheet } from './src/components/DetailSheet';
import type { FilterValue } from './src/components/FilterBar';
import { eventIdFromLink } from './src/eventLinks';
import { boundsFromRegion, INITIAL_REGION, toMapPoint, type MapBounds, type MapSession } from './src/map/presentation';
import { useMapEvents } from './src/map/useMapEvents';
import { useDeviceLocation } from './src/map/useDeviceLocation';
import { useNearbyUpdates } from './src/map/useNearbyUpdates';
import { FeedScreen } from './src/screens/FeedScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SavedScreen } from './src/screens/SavedScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { AdminWorkspace } from './src/screens/AdminWorkspace';
import { colors } from './src/theme';

type Tab = 'feed' | 'map' | 'saved' | 'settings' | 'admin';
const SETTINGS_KEY = '@citypulse/settings-v1';

export default function App() {
  const [auth, setAuth] = useState<LoginResponse | null>(null);
  const [guest, setGuest] = useState(false);
  const [startTab,setStartTab]=useState<Tab>('feed');
  const endSession = () => { clearSession(); configureDebug({...DEFAULT_SETTINGS, enabled:false}); setSettings(current=>current?{...current,enabled:false}:current); setAuth(null); setGuest(true); };
  useEffect(() => { setAuthHandler(endSession); }, []);
  useEffect(() => {
    if (!auth) return;
    const timer = setTimeout(() => { endSession(); }, Math.max(0, Date.parse(auth.expires_at) - Date.now()));
    return () => clearTimeout(timer);
  }, [auth]);
  const logout = async () => { await signOut(); endSession(); };
  const [settings, setSettings] = useState<DebugSettings | null>(null);
  const [revision, setRevision] = useState(0);
  useEffect(() => { void AsyncStorage.getItem(SETTINGS_KEY).then((value) => {
    let next = DEFAULT_SETTINGS;
    try { const saved = JSON.parse(value ?? 'null'); if (typeof saved?.enabled === 'boolean') next = { enabled: saved.enabled, time: typeof saved.time === 'string' && Number.isFinite(Date.parse(saved.time)) ? saved.time : null,
      radiusKm: Number.isFinite(saved.radiusKm) ? (saved.radiusKm === 15 && saved.cycleSeconds == null ? 7 : Math.max(0,Math.min(30,saved.radiusKm))) : 7, monitor: saved.monitor !== false,
      cycleSeconds: Number.isFinite(saved.cycleSeconds) ? Math.max(0.5, Math.min(5, saved.cycleSeconds)) : 1 }; } catch {}
    next = {...next, enabled:false}; configureDebug(next); setSettings(next);
  }).catch(() => { configureDebug({...DEFAULT_SETTINGS,enabled:false}); setSettings({...DEFAULT_SETTINGS,enabled:false}); }); }, []);
  const apply = async (next: DebugSettings, replay = false) => {
    if(auth?.user.role!=='admin') return;
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
  return <SafeAreaProvider><KnowledgeProvider key={`${revision}/${auth?.user.id||'guest'}`}>
    {!guest && !auth ? <LoginGate onLogin={setAuth} onSkip={()=>setGuest(true)} /> :
      <CityPulse key={`${revision}/${settings.enabled ? 'demo' : auth?.user.id}`} initialTab={revision > 0 || settings.enabled ? 'map' : startTab} auth={auth} onLogin={session=>{setStartTab('saved');setAuth(session)}} onUserChange={user=>setAuth(current=>current?{...current,user}:current)} onLogout={logout} settings={settings} onApplySettings={apply} />}
  </KnowledgeProvider></SafeAreaProvider>;
}

function LoginGate({ onLogin, onSkip }: { onLogin: (session: LoginResponse) => void; onSkip:()=>void }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><StatusBar style="dark" /><LoginScreen onLogin={onLogin} onSkip={onSkip} /></View>;
}

function CityPulse({ initialTab, auth, onLogin, onUserChange, onLogout, settings, onApplySettings }: { initialTab: Tab; auth: LoginResponse | null; onLogin:(session:LoginResponse)=>void; onUserChange:(user:LoginResponse['user'])=>void; onLogout: () => Promise<void>; settings: DebugSettings; onApplySettings: (settings: DebugSettings, replay?: boolean) => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [SAVED_KEY] = useState(() => settings.enabled ? storageKey('saved-events') : `@citypulse/saved-events/${auth?.user.id||'guest'}`);
  const [SAVED_DATA_KEY] = useState(() => settings.enabled ? storageKey('saved-event-data') : `@citypulse/saved-event-data/${auth?.user.id||'guest'}`);
  const [tab, setTab] = useState<Tab>(initialTab);
  const [loginOpen,setLoginOpen]=useState(false);
  const requireLogin=()=>{setDetail(null);setTab('saved');setLoginOpen(true);};
  const mapSession = useRef<MapSession>({ located: false });
  const [filter, setFilter] = useState<FilterValue>('all');
  const [error, setError] = useState('');
  const [query, setQuery] = useState('');
  const [when, setWhen] = useState<'any' | 'today' | 'weekend'>('any');
  const [pageMeta, setPageMeta] = useState({ page: 1, total: 0, has_next: false });
  const [moreError, setMoreError] = useState('');
  const feedRequest = useRef(0);
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [knownEvents, setKnownEvents] = useState<EventSummary[]>([]);
  const [mapBounds, setMapBounds] = useState<MapBounds>(boundsFromRegion(INITIAL_REGION));
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [savedReady, setSavedReady] = useState(false);
  const savingFavorites = useRef(new Set<string>());
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
      setTab('feed');
      setDetail(null);
      setDetailLoading(true);
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
    if(!auth){setSavedReady(true);return;}
    const controller = new AbortController();
    AsyncStorage.multiGet([SAVED_KEY, SAVED_DATA_KEY]).then(async (entries) => {
      if(controller.signal.aborted)return;
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
      if (!DEMO_MODE) {
        // One-time migration preserves this account's older local favorites.
        const migrated = await AsyncStorage.getItem(`${SAVED_KEY}/server-v1`);
        if (!migrated && Array.isArray(ids)) {
          for (const id of ids) if (typeof id === 'string') {
            if(controller.signal.aborted)return;
            try { await saveFavorite(id,true,controller.signal); } catch (e) {
              if (!(e instanceof Error && /404|不存在/.test(e.message))) throw e;
            }
          }
        }
        const serverIds = await allFavorites(controller.signal);
        if(controller.signal.aborted)return;
        setSavedIds(new Set(serverIds));
        await AsyncStorage.setItem(`${SAVED_KEY}/server-v1`, '1');
      }
      const cached: unknown = JSON.parse(values.get(SAVED_DATA_KEY) ?? '[]');
      if (Array.isArray(cached)) setKnownEvents((current) => {
        const merged = new Map(current.map((event) => [event.id, event]));
        cached.filter((event) => event?.id && event?.location && event?.ends_at && (DEMO_MODE || !event.is_demo))
          .forEach((event: EventSummary) => merged.set(event.id, event));
        return [...merged.values()];
      });
    }).catch(() => {if(!controller.signal.aborted)setError('收藏同步失败，当前显示本机缓存。请检查网络后重新登录重试。')}).finally(() => {if(!controller.signal.aborted)setSavedReady(true)});
    return()=>controller.abort();
  }, []);

  useEffect(() => {
    if (!savedReady || !auth) return;
    void AsyncStorage.multiSet([
      [SAVED_KEY, JSON.stringify([...savedIds])],
      [SAVED_DATA_KEY, JSON.stringify(knownEvents.filter((event) => savedIds.has(event.id)))],
    ]).catch(() => undefined);
  }, [savedReady, savedIds, knownEvents]);

  useEffect(() => {
    if (!savedReady || !auth) return;
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

  const load = useCallback(async (nextFilter: FilterValue, q = '', date: 'any' | 'today' | 'weekend' = 'any', pageNumber = 1) => {
    const request = ++feedRequest.current;
    setLoading(true);
    setMoreError('');
    if (pageNumber === 1) { setEvents([]); setPageMeta({ page: 1, total: 0, has_next: false }); }
    try {
      const page = await listEvents({
        category: !['all', 'newest', 'ending_soon', 'past'].includes(nextFilter) ? nextFilter : undefined,
        sort: nextFilter === 'newest' ? 'newest' : nextFilter === 'ending_soon' ? 'ending_soon' : 'soonest',
        time_scope: nextFilter === 'past' ? 'past' : 'upcoming',
        q, when: date, page: pageNumber,
      });
      if (request !== feedRequest.current) return;
      setEvents((current) => pageNumber === 1 ? page.data : [...new Map([...current, ...page.data].map((event) => [event.id, event])).values()]);
      setPageMeta(page.meta);
      setKnownEvents((current) => {
        const merged = new Map(current.map((event) => [event.id, event]));
        page.data.forEach((event) => merged.set(event.id, event));
        return [...merged.values()];
      });
      setOffline(false);
    } catch {
      if (request !== feedRequest.current) return;
      if (pageNumber === 1) { setEvents([]); setOffline(true); }
      else setMoreError('加载更多失败，请重试。');
    } finally {
      if (request === feedRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(filter, query, when);
  }, [load, auth, filter, query, when]);

  const changeFilter = (nextFilter: FilterValue) => {
    setFilter(nextFilter);
    if (nextFilter === 'past') setWhen('any');
  };

  const toggleSaved = (id: string) => {
    if(!auth){requireLogin();return;}
    if (!savedReady || savingFavorites.current.has(id)) return;
    const save = !savedIds.has(id);
    savingFavorites.current.add(id);
    void (DEMO_MODE ? Promise.resolve() : saveFavorite(id, save)).then(() => {
      setSavedIds(current => {const next=new Set(current);if(save)next.add(id);else next.delete(id);return next});
    }).catch(() => Alert.alert('收藏未更新', '无法连接服务，请稍后重试。')).finally(() => savingFavorites.current.delete(id));
  };

  useEffect(() => {
    if(!auth||tab!=='saved'||DEMO_MODE||!savedReady||savingFavorites.current.size)return;
    let active=true;
    void allFavorites().then(ids=>{if(active&&!savingFavorites.current.size)setSavedIds(new Set(ids))}).catch(()=>undefined);
    return()=>{active=false};
  },[tab,savedReady]);

  const openSummary = async (event: EventSummary) => {
    setDetail(null);
    setError('');
    setDetailLoading(true);
    try {
      setDetail(await getEvent(event.id));
      setOffline(false);
    } catch {
      setError('无法加载活动详情，活动可能已下架。请稍后重试。');
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
      setError('无法加载活动详情，请稍后重试。');
    } finally {
      setDetailLoading(false);
    }
  };

  const tabs = useMemo(
    () => [
      { id: 'feed' as const, icon: '⌁', label: '发现' },
      { id: 'map' as const, icon: '⌖', label: '地图' },
      { id: 'saved' as const, icon: '♙', label: '我的' },
      ...(auth?.user.role === 'admin' ? [{ id: 'admin' as const, icon: '✓', label: '审核' }] : []),
    ],
    [auth?.user.role, settings.enabled],
  );


  return (
    <View style={styles.safeArea}>
      <StatusBar style="dark" />
      {!!error && <Pressable onPress={() => setError('')}><Text accessibilityRole="alert" style={{ color: '#A12626', padding: 12 }}>{error}</Text></Pressable>}
      <View style={[styles.content, tab !== 'map' && { paddingTop: insets.top, paddingBottom: 90 + insets.bottom }]}>
        {tab === 'admin' && auth?.user.role === 'admin' && (settings.enabled ? <View style={{padding:24,gap:16}}><Text style={{fontSize:24,fontWeight:'700'}}>审批</Text><Text>调试已开启，暂无法审批。正式审批数据保留，关闭调试后可继续处理。</Text><Pressable accessibilityRole="button" onPress={()=>setTab('settings')}><Text>前往设置关闭调试</Text></Pressable></View> : <AdminWorkspace userId={auth.user.id} onChanged={() => { void load(filter, query, when); }} />)}
        {tab === 'settings' && <SettingsScreen user={auth?.user??null} onUserChange={onUserChange} onLogout={onLogout} onLogin={requireLogin} settings={settings} onApply={onApplySettings} onBack={() => setTab('saved')} />}
        {tab === 'feed' && (
          <FeedScreen
            signedIn={Boolean(auth)} onLogin={requireLogin}
            onOpenPosterEvent={openId}
            onSavePosterEvent={async (id) => {
              if (!savedReady) throw new Error('收藏尚未加载，请稍后重试');
              const event = await getEvent(id);
              await saveFavorite(id);
              setKnownEvents(current => [...current.filter(item => item.id !== id), event]);
              setSavedIds(current => new Set([...current, id]));
            }}
            events={events}
            query={query}
            when={when}
            total={pageMeta.total}
            hasMore={pageMeta.has_next}
            moreError={moreError}
            onSearch={setQuery}
            onWhenChange={(value) => { setWhen(value); if (value !== 'any' && filter === 'past') setFilter('all'); }}
            onLoadMore={() => { if (!loading && pageMeta.has_next) void load(filter, query, when, pageMeta.page + 1); }}
            filter={filter}
            loading={loading}
            offline={offline}
            savedIds={savedIds}
            onFilterChange={changeFilter}
            onRefresh={() => load(filter, query, when)}
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
        {tab === 'saved' && (loginOpen&&!auth ? <LoginScreen onLogin={onLogin} onSkip={()=>setLoginOpen(false)}/> :
          <SavedScreen user={auth?.user??null} onLogin={()=>setLoginOpen(true)} debug={settings.enabled}
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
              onPress={() => { setTab(item.id); if (item.id === 'feed') void load(filter, query, when); }}
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
        onSubmitCorrection={async(message) => {
          if(!auth){requireLogin();throw new Error('请登录后提交纠错');}
          if(detail)await submitCorrection({ event_id: detail.id, kind: 'other', message });
        }}
      />
      {settings.enabled && settings.monitor && <PerformanceMonitor visible={tab === 'map'} />}
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1 },
  accountBar: { flexDirection: 'row', padding: 12, gap: 12, borderBottomWidth: 1, borderColor: colors.line },
  accountText: { flex: 1, color: colors.inkMuted, fontSize: 12 },
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
