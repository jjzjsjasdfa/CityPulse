import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, Pressable, SafeAreaView, StyleSheet, Text, View } from 'react-native';

import { getEvent, listEvents, listMapEvents, submitCorrection } from './src/api/client';
import type { EventDetail, EventSummary, MapEvent } from './src/api/types';
import { DetailSheet } from './src/components/DetailSheet';
import type { FilterValue } from './src/components/FilterBar';
import { FALLBACK_EVENTS, fallbackDetail } from './src/data/fallback';
import { eventIdFromLink } from './src/eventLinks';
import { FeedScreen } from './src/screens/FeedScreen';
import { MapScreen } from './src/screens/MapScreen';
import { SavedScreen } from './src/screens/SavedScreen';
import { colors } from './src/theme';

type Tab = 'feed' | 'map' | 'saved';
const SAVED_KEY = '@citypulse/saved-events';

const toMapPoint = (event: EventSummary): MapEvent => ({
  id: event.id,
  name: event.name,
  category: event.category,
  status: event.status,
  starts_at: event.starts_at,
  latitude: event.location.latitude,
  longitude: event.location.longitude,
});

function fallbackForFilter(filter: FilterValue): EventSummary[] {
  if (filter === 'newest') return FALLBACK_EVENTS.filter((event) => event.is_new);
  if (filter === 'ending_soon') return FALLBACK_EVENTS.filter((event) => event.is_ending_soon);
  if (filter !== 'all') return FALLBACK_EVENTS.filter((event) => event.category === filter);
  return FALLBACK_EVENTS;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('feed');
  const [filter, setFilter] = useState<FilterValue>('all');
  const [events, setEvents] = useState<EventSummary[]>(FALLBACK_EVENTS);
  const [knownEvents, setKnownEvents] = useState<EventSummary[]>(FALLBACK_EVENTS);
  const [mapPoints, setMapPoints] = useState<MapEvent[]>(FALLBACK_EVENTS.map(toMapPoint));
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<EventDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [offline, setOffline] = useState(true);

  useEffect(() => {
    let active = true;
    let request = 0;
    const openSharedEvent = async (url: string | null) => {
      const id = url ? eventIdFromLink(url) : null;
      if (!id) return;
      const current = ++request;
      const demo = FALLBACK_EVENTS.find((event) => event.id === id);
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
    AsyncStorage.getItem(SAVED_KEY)
      .then((value) => value && setSavedIds(new Set(JSON.parse(value) as string[])))
      .catch(() => undefined);
  }, []);

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
      setEvents(fallbackForFilter(nextFilter));
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
      void AsyncStorage.setItem(SAVED_KEY, JSON.stringify([...next]));
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
      setDetail(await getEvent(id));
    } finally {
      setDetailLoading(false);
    }
  };

  const updateMapBounds = useCallback(
    async (bounds: { west: number; south: number; east: number; north: number }) => {
      try {
        const category = !['all', 'newest', 'ending_soon'].includes(filter) ? filter : undefined;
        setMapPoints(await listMapEvents(bounds, category));
      } catch {
        setMapPoints(
          FALLBACK_EVENTS.filter(
            (event) =>
              event.location.longitude >= bounds.west &&
              event.location.longitude <= bounds.east &&
              event.location.latitude >= bounds.south &&
              event.location.latitude <= bounds.north,
          ).map(toMapPoint),
        );
      }
    },
    [filter],
  );

  const tabs = useMemo(
    () => [
      { id: 'feed' as const, icon: '⌁', label: '发现' },
      { id: 'map' as const, icon: '⌖', label: '地图' },
      { id: 'saved' as const, icon: '♡', label: '收藏' },
    ],
    [],
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <View style={styles.content}>
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
              onPress={() => setTab(item.id)}
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
