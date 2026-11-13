import AsyncStorage from '@react-native-async-storage/async-storage';
import { NavigationContainer } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';

import { clearSession, getEvent, listEvents, setAuthHandler, signOut, submitCorrection } from './src/api/client';
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
  useEffect(() => { setAuthHandler(() => setAuth(null)); }, []);
  useEffect(() => {
    if (!auth) return;
    const timer = setTimeout(() => { clearSession(); setAuth(null); }, Math.max(0, Date.parse(auth.expires_at) - Date.now()));
    return () => clearTimeout(timer);
  }, [auth]);
  /** Ends the server session and returns the app to the login screen. */
  const logout = async () => { await signOut(); setAuth(null); };
  return <SafeAreaProvider>
    {!auth ? <LoginGate onLogin={setAuth} /> : <CityPulse auth={auth} onLogout={logout} />}
  </SafeAreaProvider>;
}

/** Wraps the login screen in safe-area padding; `onLogin` stores a successful session. */
function LoginGate({ onLogin }: { onLogin: (session: LoginResponse) => void }) {
  const insets = useSafeAreaInsets();
  return <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}><StatusBar style="dark" /><LoginScreen onLogin={onLogin} /></View>;
}

/** Runs the signed-in app; `auth` identifies the user and `onLogout` ends the session. */
function CityPulse({ auth, onLogout }: { auth: LoginResponse; onLogout: () => Promise<void> }) {
  const insets = useSafeAreaInsets();
  const [SAVED_KEY] = useState(() => `@citypulse/saved-events/${auth.user.id}`);
  const [SAVED_DATA_KEY] = useState(() => `@citypulse/saved-event-data/${auth.user.id}`);
  const [activeRoute, setActiveRoute] = useState<keyof AppTabParamList | null>('Feed');
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
    AsyncStorage.multiGet([SAVED_KEY, SAVED_DATA_KEY]).then(async (entries) => {
      const values = new Map(entries);
      const ids: unknown = JSON.parse(values.get(SAVED_KEY) ?? '[]');
      if (Array.isArray(ids)) setSavedIds(new Set(ids.filter((id): id is string => typeof id === 'string')));
      const cached: unknown = JSON.parse(values.get(SAVED_DATA_KEY) ?? '[]');
      if (Array.isArray(cached)) setKnownEvents((current) => {
        const merged = new Map(current.map((event) => [event.id, event]));
        cached.filter((event) => event?.id && event?.location && event?.ends_at)
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
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  return <View style={styles.safeArea}>
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
              <Text style={styles.accountText}>{auth.user.email} · {auth.user.role === 'admin' ? '管理员' : '普通用户'}</Text>
              <Pressable accessibilityRole="button" onPress={() => { void onLogout().catch(() => setError('退出失败，请检查网络后重试。')); }}><Text style={{ color: colors.green }}>退出</Text></Pressable>
            </View>
            {!!error && <Pressable onPress={() => setError('')}><Text accessibilityRole="alert" style={styles.error}>{error}</Text></Pressable>}
            <AppTabs.Navigator
              backBehavior="history"
              screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.paper } }}
              tabBar={(props) => <FloatingTabBar {...props} />}
            >
              <AppTabs.Screen name="Feed" options={{ title: '发现', tabBarAccessibilityLabel: '发现' }} listeners={{ tabPress: () => { void load(filter, query, when); } }}>
                {() => <View style={[styles.content, { paddingBottom: 90 + insets.bottom }]}><FeedScreen
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
                {() => <View style={[styles.content, { paddingBottom: 90 + insets.bottom }]}><SavedScreen
                  events={knownEvents} savedIds={savedIds}
                  onSelect={(event) => openEvent(event.id)} onToggleSaved={toggleSaved}
                /></View>}
              </AppTabs.Screen>
              {auth.user.role === 'admin' && <AppTabs.Screen name="Admin" options={{ title: '管理', tabBarAccessibilityLabel: '管理' }}>
                {() => <View style={[styles.content, { paddingBottom: 90 + insets.bottom }]}><AdminWorkspace
                  userId={auth.user.id} onChanged={() => { void load(filter, query, when); }}
                /></View>}
              </AppTabs.Screen>}
            </AppTabs.Navigator>
          </View>}
        </RootStack.Screen>
        <RootStack.Screen name="EventDetail" options={{ animation: 'slide_from_bottom', presentation: 'modal' }}>
          {(props) => <EventDetailRoute
            {...props} savedIds={savedIds} onToggleSaved={toggleSaved}
            onLoaded={rememberEvent} onViewed={viewEvent}
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
};

/** Loads and displays the event selected by the detail route's `eventId` parameter. */
function EventDetailRoute({ route, navigation, savedIds, onToggleSaved, onLoaded, onViewed }: EventDetailRouteProps) {
  const insets = useSafeAreaInsets();
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

  if (!event) return <View style={[styles.detailState, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    {error ? <>
      <Text accessibilityRole="alert" style={styles.detailError}>{error}</Text>
      <Pressable accessibilityRole="button" onPress={close} style={styles.closeButton}><Text style={styles.closeButtonText}>返回</Text></Pressable>
    </> : <ActivityIndicator color={colors.orange} />}
  </View>;
  return <View style={[styles.safeArea, { paddingTop: insets.top, paddingBottom: insets.bottom }]}>
    <DetailSheet
      event={event} loading={false} saved={savedIds.has(event.id)} onClose={close}
      onToggleSaved={() => onToggleSaved(event.id)}
      onSubmitCorrection={(message) => submitCorrection({ event_id: event.id, kind: 'other', message })}
    />
  </View>;
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
