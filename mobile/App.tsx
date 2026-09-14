import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { clearSession, getEvent, listEvents, listMapEvents, setAuthHandler, signOut, submitCorrection } from './src/api/client';
import type { EventDetail, EventSummary, LoginResponse, MapEvent } from './src/api/types';
import { DetailSheet } from './src/components/DetailSheet';
import type { FilterValue } from './src/components/FilterBar';
import { eventIdFromLink } from './src/eventLinks';
import { FeedScreen } from './src/screens/FeedScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SavedScreen } from './src/screens/SavedScreen';
import { LoginScreen } from './src/screens/LoginScreen';
import { AdminWorkspace } from './src/screens/AdminWorkspace';
import { colors } from './src/theme';

type Tab = 'feed' | 'map' | 'saved' | 'admin';
const SAVED_KEY = '@citypulse/saved-events';

export default function App() {
  const [auth, setAuth] = useState<LoginResponse | null>(null);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<Tab>('feed');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [query, setQuery] = useState('');
  const [when, setWhen] = useState<'any' | 'today' | 'weekend'>('any');
  const [pageMeta, setPageMeta] = useState({ page: 1, total: 0, has_next: false });
  const [moreError, setMoreError] = useState('');
  const [events, setEvents] = useState<EventSummary[]>([]);
  const [knownEvents, setKnownEvents] = useState<EventSummary[]>([]);
  const [mapPoints, setMapPoints] = useState<MapEvent[]>([]);
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [offline, setOffline] = useState(false);
  const feedRequest = useRef(0);

  useEffect(() => {
    setAuthHandler(() => { setAuth(null); setTab('feed'); setDetail(null); });
  }, []);
  useEffect(() => {
    if (!auth) return;
    const timer = setTimeout(() => {
      clearSession(); setAuth(null); setTab('feed'); setDetail(null);
    }, Math.max(0, Date.parse(auth.expires_at) - Date.now()));
    return () => clearTimeout(timer);
  }, [auth]);

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
    let active = true;
    setSavedIds(new Set());
    if (!auth) return;
    AsyncStorage.getItem(`${SAVED_KEY}/${auth.user.id}`)
      .then((value) => { if (value && active) setSavedIds(new Set(JSON.parse(value) as string[])); })
      .catch(() => undefined);
    return () => { active = false; };
  }, [auth]);

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
    if (auth) void load(filter, query, when);
  }, [load, auth, filter, query, when]);

  useEffect(() => {
    let active = true;
    Promise.all([...savedIds].map((id) => getEvent(id).catch(() => null))).then((saved) => {
      if (active) setKnownEvents(saved.filter((event): event is EventDetail => event !== null));
    });
    return () => { active = false; };
  }, [savedIds]);

  const changeFilter = (nextFilter: FilterValue) => {
    setFilter(nextFilter);
    if (nextFilter === 'past') setWhen('any');
  };

  const toggleSaved = (id: string) => {
    setSavedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      if (auth) void AsyncStorage.setItem(`${SAVED_KEY}/${auth.user.id}`, JSON.stringify([...next]));
      return next;
    });
  };

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
      setDetail(await getEvent(id));
    } catch {
      setError('无法加载活动详情，请稍后重试。');
    } finally {
      setDetailLoading(false);
    }
  };

  const updateMapBounds = useCallback(
    async (bounds: { west: number; south: number; east: number; north: number }) => {
      try {
        const category = !['all', 'newest', 'ending_soon', 'past'].includes(filter) ? filter : undefined;
        setMapPoints(await listMapEvents(bounds, category));
      } catch {
        setMapPoints([]);
        setError('无法加载地图活动，请稍后重试。');
      }
    },
    [filter],
  );

  const tabs = useMemo(
    () => [
      { id: 'feed' as const, icon: '⌁', label: '发现' },
      { id: 'map' as const, icon: '⌖', label: '地图' },
      { id: 'saved' as const, icon: '♡', label: '收藏' },
      ...(auth?.user.role === 'admin' ? [{ id: 'admin' as const, icon: '✓', label: '审核' }] : []),
    ],
    [auth?.user.role],
  );

  if (!auth) return <SafeAreaView style={styles.safeArea}><StatusBar style="dark" /><LoginScreen onLogin={(session) => { setError(''); setAuth(session); setTab('feed'); setFilter('all'); setQuery(''); setWhen('any'); }} /></SafeAreaView>;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.accountBar}>
        <Text style={styles.accountText}>{auth.user.email} · {auth.user.role === 'admin' ? '管理员' : '普通用户'}</Text>
        <Pressable accessibilityRole="button" onPress={async () => {
          try { await signOut(); setAuth(null); setTab('feed'); setDetail(null); }
          catch { setError('退出失败，请检查网络后重试。'); }
        }}><Text style={{ color: colors.green }}>退出</Text></Pressable>
      </View>
      {!!error && <Pressable onPress={() => setError('')}><Text accessibilityRole="alert" style={{ color: '#A12626', padding: 12 }}>{error}</Text></Pressable>}
      {detailLoading && <Text style={{ padding: 12 }}>正在加载活动详情…</Text>}
      <View style={styles.content}>
        {tab === 'admin' && auth.user.role === 'admin' && <AdminWorkspace userId={auth.user.id} onChanged={() => { void load(filter, query, when); setMapPoints([]); }} />}
        {tab === 'feed' && (
          <FeedScreen
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
          <MapScreen points={mapPoints} onBoundsChange={updateMapBounds} onSelectId={openId} />
        )}
        {tab === 'saved' && (
          <SavedScreen
            events={knownEvents}
            savedIds={savedIds}
            onSelect={openSummary}
            onToggleSaved={toggleSaved}
          />
        )}
      </View>
      <View style={styles.tabBar}>
        {tabs.map((item) => {
          const active = tab === item.id;
          return (
            <Pressable
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              key={item.id}
              onPress={() => { setTab(item.id); if (item.id === 'feed') void load(filter, query, when); }}
              style={({ pressed }) => [styles.tab, pressed && { opacity: 0.7 }]}
            >
              <Text style={[styles.tabIcon, active && styles.tabActive]}>{item.icon}</Text>
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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: colors.paper },
  content: { flex: 1 },
  accountBar: { flexDirection: 'row', padding: 12, gap: 12, borderBottomWidth: 1, borderColor: colors.line },
  accountText: { flex: 1, color: colors.inkMuted, fontSize: 12 },
  tabBar: {
    height: 72,
    backgroundColor: colors.white,
    borderTopColor: colors.line,
    borderTopWidth: 1,
    flexDirection: 'row',
    paddingHorizontal: 18,
    paddingBottom: 5,
  },
  tab: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  tabIcon: { color: '#7B8C89', fontSize: 25, lineHeight: 27 },
  tabLabel: { color: '#7B8C89', fontSize: 11, fontWeight: '800', marginTop: 2 },
  tabActive: { color: colors.orange },
});
