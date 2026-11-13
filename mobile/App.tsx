import { allFavorites, saveFavorite } from './src/api/knowledge';
import { KnowledgeProvider } from './src/components/Knowledge';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { layoutForWidth } from './src/layout';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Alert, AppState, useWindowDimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearSession, getEvent, listEvents, renewSession, restoreSession, setAuthHandler, signOut, submitCorrection } from './src/api/client';
import { useActivityAlerts } from './src/map/useActivityAlerts';
import type { EventDetail, EventSummary, LoginResponse, MapEvent } from './src/api/types';
import { DetailSheet } from './src/components/DetailSheet';
import type { FilterValue } from './src/components/FilterBar';
import { boundsFromRegion, INITIAL_REGION, toMapPoint, type MapBounds, type MapSession } from './src/map/presentation';
import { useMapEvents } from './src/map/useMapEvents';
import { useDeviceLocation } from './src/map/useDeviceLocation';
import { useNearbyUpdates } from './src/map/useNearbyUpdates';
import { AppTabs, FloatingTabBar, linking, navigationRef, RootStack, type AppTabParamList, type RootStackParamList } from './src/navigation';
import { FeedScreen } from './src/screens/FeedScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SavedScreen } from './src/screens/SavedScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { AdminWorkspace } from './src/screens/AdminWorkspace';
import { colors } from './src/theme';

/** Application root: owns authentication and mounts the signed-in navigation tree. */

export default function App() {
  const [auth, setAuth] = useState<LoginResponse | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [restoreError, setRestoreError] = useState(false);
  const restore = async () => {
    setRestoreError(false);
    try { setAuth(await restoreSession()); setAuthReady(true); }
    catch { setRestoreError(true); }
  };
  useEffect(() => { void restore(); }, []);
  const [guest, setGuest] = useState(false);
  const [startTab,setStartTab]=useState<keyof AppTabParamList>('Feed');
  const endSession = () => { clearSession(); setAuth(null); setGuest(true); };
  useEffect(() => { setAuthHandler(endSession); }, []);
  useEffect(() => {
    if (!auth) return;
    let active = true;
    let pending = false;
    const renew = async () => {
      if (pending) return;
      pending = true;
      try { const session = await renewSession(); if (active && session) setAuth(session); }
      catch { /* Network failure retains the session; 401 is handled centrally. */ }
      finally { pending = false; }
    };
    const timer = setInterval(() => { void renew(); }, 6 * 60 * 60 * 1000);
    const subscription = AppState.addEventListener('change', state => { if (state === 'active') void renew(); });
    return () => { active = false; clearInterval(timer); subscription.remove(); };
  }, [auth?.access_token]);
  const logout = async () => { await signOut(); endSession(); };
  if (!authReady) return <View style={{ flex: 1, backgroundColor: colors.paper, justifyContent:'center', alignItems:'center', gap:16 }}>
    <Text>{restoreError ? '暂时无法连接账号服务，登录信息已保留。' : '正在恢复登录状态…'}</Text>
    {restoreError && <><Pressable accessibilityRole="button" onPress={()=>void restore()}><Text>重试</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>{setGuest(true);setAuthReady(true);}}><Text>暂不登录，随便看看</Text></Pressable></>}
  </View>;
  return <SafeAreaProvider><KnowledgeProvider key={auth?.user.id ?? 'guest'}>
    {!guest && !auth ? <LoginGate onLogin={setAuth} onSkip={()=>setGuest(true)} /> :
      <CityPulse key={auth?.user.id ?? 'guest'} initialTab={startTab} auth={auth} onLogin={session=>{setStartTab('Saved');setAuth(session)}} onUserChange={user=>setAuth(current=>current?{...current,user}:current)} onLogout={logout} />}
  </KnowledgeProvider></SafeAreaProvider>;
}

function LoginGate({ onLogin, onSkip }: { onLogin: (session: LoginResponse) => void; onSkip:()=>void }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><StatusBar style="dark" /><LoginScreen onLogin={onLogin} onSkip={onSkip} /></View>;
}

/** Runs the signed-in app; `auth` identifies the user and `onLogout` ends the session. */
function CityPulse({ initialTab, auth, onLogin, onUserChange, onLogout }: {
  initialTab: keyof AppTabParamList; auth: LoginResponse | null;
  onLogin: (session: LoginResponse) => void; onUserChange: (user: LoginResponse['user']) => void;
  onLogout: () => Promise<void>;
}) {
  const layout = layoutForWidth(useWindowDimensions().width);
  const [loginOpen, setLoginOpen] = useState(false);
  const requireLogin = () => {
    setLoginOpen(true);
    if (navigationRef.isReady()) navigationRef.navigate('Main', { screen: 'Saved' });
  };
  const insets = useSafeAreaInsets();
  const [SAVED_KEY] = useState(() => `@citypulse/saved-events/${auth?.user.id ?? 'guest'}`);
  const [SAVED_DATA_KEY] = useState(() => `@citypulse/saved-event-data/${auth?.user.id ?? 'guest'}`);
  const [activeRoute, setActiveRoute] = useState<keyof AppTabParamList | null>(initialTab);
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
  const [loading, setLoading] = useState(false);
  const [offline, setOffline] = useState(true);
  const location = useDeviceLocation();
  const nearby = useNearbyUpdates(location.status === 'ready' ? location.position : null, activeRoute === 'Map');
  const mapData = useMapEvents(mapBounds, activeRoute === 'Map');
  const mapPoints = useMemo(() => {
    const base = mapData.offline && nearby.points.length ? [] : mapData.points;
    const merged = new Map<string, MapEvent>(nearby.points.map((point) => [point.id, point]));
    // A current viewport response includes admin edits; nearby snapshots may be older.
    base.forEach((point) => merged.set(point.id, point));
    knownEvents.filter((event) => savedIds.has(event.id) && !merged.has(event.id)).forEach((event) => merged.set(event.id, toMapPoint(event)));
    return [...merged.values()];
  }, [mapBounds, knownEvents, savedIds, mapData.points, mapData.offline, nearby.points]);
  const alerts = useActivityAlerts(mapPoints, location.status === 'ready' ? location.position : null);
  const completedKey = alerts.completedIds.join(',');
  useEffect(() => { if (completedKey) nearby.acknowledge(completedKey.split(',')); }, [completedKey, nearby.acknowledge]);

  useEffect(() => {
    if(!auth){setSavedReady(true);return;}
    const controller = new AbortController();
    AsyncStorage.multiGet([SAVED_KEY, SAVED_DATA_KEY]).then(async (entries) => {
      if(controller.signal.aborted)return;
      const values = new Map(entries);
      const ids: unknown = JSON.parse(values.get(SAVED_KEY) ?? '[]');
      if (Array.isArray(ids)) setSavedIds(new Set(ids.filter((id): id is string => typeof id === 'string')));
      if (auth) {
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
        cached.filter((event) => event?.id && event?.location && event?.ends_at)
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

  /** Loads one feed page using `nextFilter`, search `q`, date scope, and one-based page number. */
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

  /** Applies `nextFilter` and clears incompatible date filtering for past events. */
  const changeFilter = (nextFilter: FilterValue) => {
    setFilter(nextFilter);
    if (nextFilter === 'past') setWhen('any');
  };

  /** Adds or removes event `id` from the current user's saved set. */
  const toggleSaved = (id: string) => {
    if(!auth){requireLogin();return;}
    if (!savedReady || savingFavorites.current.has(id)) return;
    const save = !savedIds.has(id);
    savingFavorites.current.add(id);
    void saveFavorite(id, save).then(() => {
      setSavedIds(current => {const next=new Set(current);if(save)next.add(id);else next.delete(id);return next});
    }).catch(() => Alert.alert('收藏未更新', '无法连接服务，请稍后重试。')).finally(() => savingFavorites.current.delete(id));
  };

  useEffect(() => {
    if(!auth||activeRoute!=='Saved'||!savedReady||savingFavorites.current.size)return;
    let active=true;
    void allFavorites().then(ids=>{if(active&&!savingFavorites.current.size)setSavedIds(new Set(ids))}).catch(()=>undefined);
    return()=>{active=false};
  },[activeRoute,savedReady]);


  /** Opens the detail route for event `id` when navigation is ready. */
  const openEvent = useCallback((id: string) => {
    if (navigationRef.isReady()) navigationRef.navigate('EventDetail', { eventId: id });
  }, []);
  /** Caches a freshly loaded `event` for saved and map views. */
  const rememberEvent = useCallback((event: EventDetail) => {
    setKnownEvents((current) => [...current.filter((item) => item.id !== event.id), event]);
    setOffline(false);
  }, []);
  /** Marks event `id` as viewed in both nearby-update alert systems. */
  const viewEvent = useCallback((id: string) => {
    nearby.view(id);
    alerts.view(id);
  }, [alerts.view, nearby.view]);
  /** Mirrors the current tab name so background polling only runs on the map. */
  const updateActiveRoute = useCallback(() => {
    const name = navigationRef.getCurrentRoute()?.name;
    setActiveRoute(name === 'Feed' || name === 'Map' || name === 'Saved' || name === 'Admin' ? name : null);
  }, []);

  return <View testID={`layout-${layout.mode}`} style={styles.safeArea}>
    <StatusBar style="dark" />
    <NavigationContainer
      fallback={<View style={styles.loading}><ActivityIndicator color={colors.orange} /></View>}
      linking={linking}
      onReady={updateActiveRoute}
      onStateChange={updateActiveRoute}
      ref={navigationRef}
    >
      <RootStack.Navigator initialRouteName="Main" screenOptions={{ headerShown: false }}>
        <RootStack.Screen name="Main">
          {() => <View style={styles.safeArea}>
            <View style={[styles.accountBar, { paddingTop: Math.max(12, insets.top) }]}>
              <Text style={styles.accountText}>{auth ? `${auth.user.email} · ${auth.user.role === 'admin' ? '管理员' : '普通用户'}` : '游客浏览'}</Text>
              {auth && <Pressable accessibilityRole="button" onPress={() => { void onLogout().catch(() => setError('退出失败，请检查网络后重试。')); }}><Text style={{ color: colors.green }}>退出</Text></Pressable>}
            </View>
            {!!error && <Pressable onPress={() => setError('')}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></Pressable>}
            <AppTabs.Navigator
              initialRouteName={initialTab}
              backBehavior="history"
              screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}
              tabBar={(props) => <FloatingTabBar {...props} />}
            >
              <AppTabs.Screen name="Feed" options={{ title: '发现', tabBarAccessibilityLabel: '发现' }} listeners={{ tabPress: () => { void load(filter, query, when); } }}>
                {() => <View style={[styles.content, { paddingBottom: layout.rail ? insets.bottom : 90 + insets.bottom, marginLeft: layout.rail }]}><FeedScreen
                  signedIn={Boolean(auth)} onLogin={requireLogin} onOpenPosterEvent={openEvent}
                  onSavePosterEvent={async (id) => {
                    if (!auth) { requireLogin(); throw new Error('请先登录'); }
                    if (!savedReady) throw new Error('收藏尚未加载，请稍后重试');
                    const event = await getEvent(id);
                    await saveFavorite(id);
                    rememberEvent(event);
                    setSavedIds(current => new Set([...current, id]));
                  }}
                  events={events} query={query} when={when} total={pageMeta.total}
                  hasMore={pageMeta.has_next} moreError={moreError} onSearch={setQuery}
                  onWhenChange={(value) => { setWhen(value); if (value !== 'any' && filter === 'past') setFilter('all'); }}
                  onLoadMore={() => { if (!loading && pageMeta.has_next) void load(filter, query, when, pageMeta.page + 1); }}
                  filter={filter} loading={loading} offline={offline} savedIds={savedIds}
                  onFilterChange={changeFilter} onRefresh={() => load(filter, query, when)}
                  onSelect={(event) => openEvent(event.id)} onToggleSaved={toggleSaved}
                /></View>}
              </AppTabs.Screen>
              <AppTabs.Screen name="Map" options={{ title: '地图', tabBarAccessibilityLabel: '地图' }}>
                {() => <MapScreen
                  session={mapSession.current} points={mapPoints} savedIds={savedIds} loading={mapData.loading}
                  offline={mapData.offline && !nearby.points.length}
                  incomplete={mapData.incomplete || (mapData.offline && nearby.points.length > 0)}
                  onBoundsChange={setMapBounds} onSelectId={openEvent}
                  position={location.status === 'ready' ? location.position : null}
                  locationStatus={location.status} onLocate={location.retryLocation}
                  newEvents={nearby.events} onSeenEvents={nearby.acknowledge} updatesUnavailable={nearby.unavailable}
                  unreadIds={alerts.unreadIds} haloUntil={alerts.haloUntil} onVisibleEvents={alerts.onVisible}
                />}
              </AppTabs.Screen>
              <AppTabs.Screen name="Saved" options={{ title: '我的', tabBarAccessibilityLabel: '我的' }}>
                {() => <View style={[styles.content, { paddingBottom: layout.rail ? insets.bottom : 90 + insets.bottom, marginLeft: layout.rail }]}>{loginOpen && !auth ? <LoginScreen onLogin={onLogin} onSkip={() => setLoginOpen(false)} /> : <SavedScreen
                  user={auth?.user ?? null} onLogin={requireLogin}
                  onSettings={() => navigationRef.navigate('Settings')}
                  events={knownEvents} savedIds={savedIds}
                  onSelect={(event) => openEvent(event.id)} onToggleSaved={toggleSaved}
                />}</View>}
              </AppTabs.Screen>
              {auth?.user.role === 'admin' && <AppTabs.Screen name="Admin" options={{ title: '管理', tabBarAccessibilityLabel: '管理' }}>
                {() => <View style={[styles.content, { paddingBottom: layout.rail ? insets.bottom : 90 + insets.bottom, marginLeft: layout.rail }]}><AdminWorkspace
                  userId={auth.user.id} onChanged={() => { void load(filter, query, when); }}
                /></View>}
              </AppTabs.Screen>}
            </AppTabs.Navigator>
          </View>}
        </RootStack.Screen>
        <RootStack.Screen name="Settings">
          {({ navigation }) => <SettingsScreen user={auth?.user ?? null} onUserChange={onUserChange} onLogout={onLogout} onLogin={requireLogin} onBack={() => navigation.goBack()} />}
        </RootStack.Screen>
        <RootStack.Screen name="EventDetail" options={{ animation: 'slide_from_bottom', presentation: 'transparentModal', contentStyle: { backgroundColor: 'transparent' } }}>
          {(props) => <EventDetailRoute
            {...props} savedIds={savedIds} onToggleSaved={toggleSaved}
            onLoaded={rememberEvent} onViewed={viewEvent} signedIn={Boolean(auth)} onLogin={requireLogin}
          />}
        </RootStack.Screen>
      </RootStack.Navigator>
    </NavigationContainer>
  </View>;
}

type EventDetailRouteProps = NativeStackScreenProps<RootStackParamList, 'EventDetail'> & {
  savedIds: ReadonlySet<string>;
  onToggleSaved: (id: string) => void;
  onLoaded: (event: EventDetail) => void;
  onViewed: (id: string) => void;
  signedIn: boolean; onLogin: () => void;
};

/** Loads and displays the event selected by the detail route's `eventId` parameter. */
function EventDetailRoute({ route, navigation, savedIds, onToggleSaved, onLoaded, onViewed, signedIn, onLogin }: EventDetailRouteProps) {
  const insets = useSafeAreaInsets();
  const layout = layoutForWidth(useWindowDimensions().width);
  const panelStyle = layout.detail ? { width: layout.detail, alignSelf: 'flex-end' as const, borderLeftWidth: 1, borderColor: colors.line } : undefined;
  const [event, setEvent] = useState<EventDetail | null>(null);
  const [error, setError] = useState('');
  /** Closes detail through history, falling back to Feed for direct deep links. */
  const close = () => navigation.canGoBack() ? navigation.goBack() : navigation.replace('Main', { screen: 'Feed' });
  useEffect(() => {
    const controller = new AbortController();
    setEvent(null);
    setError('');
    void getEvent(route.params.eventId, controller.signal).then((next) => {
      if (controller.signal.aborted) return;
      setEvent(next);
      onLoaded(next);
      onViewed(next.id);
    }).catch((reason) => {
      if (!controller.signal.aborted && !(reason instanceof Error && reason.name === 'AbortError')) {
        setError('活动可能已下架，或网络暂时不可用。请稍后重试。');
      }
    });
    return () => controller.abort();
  }, [route.params.eventId, onLoaded, onViewed]);

  if (!event) return <View style={[styles.detailState, panelStyle, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    {error ? <>
      <Text accessibilityRole="alert" style={styles.detailError}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={close} style={styles.closeButton}><Text style={styles.closeButtonText}>返回</Text></Pressable>
    </> : <ActivityIndicator color={colors.orange} />}
  </View>;
  return <View pointerEvents="box-none" style={{ flex: 1 }}><View style={[styles.safeArea, panelStyle, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <DetailSheet
      event={event} loading={false} saved={savedIds.has(event.id)} onClose={close}
      onToggleSaved={() => onToggleSaved(event.id)}
      onSubmitCorrection={async (message) => {
        if (!signedIn) { onLogin(); throw new Error('请登录后提交纠错'); }
        await submitCorrection({ event_id: event.id, kind: 'other', message });
      }}
    />
  </View></View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.paper },
  accountBar: { flexDirection: 'row', padding: 12, gap: 12, borderBottomWidth: 1, borderColor: colors.line },
  accountText: { flex: 1, color: colors.inkMuted, fontSize: 12 },
  error: { color: '#A12626', padding: 12 },
  detailState: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 18, paddingHorizontal: 28, backgroundColor: colors.paper },
  detailError: { color: '#A12626', fontSize: 15, lineHeight: 22, textAlign: 'center' },
  closeButton: { backgroundColor: colors.ink, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 12 },
  closeButtonText: { color: colors.white, fontWeight: '800' },
});
