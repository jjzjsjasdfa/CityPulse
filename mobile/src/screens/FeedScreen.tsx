import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, TextInput, View } from 'react-native';

import type { EventSummary } from '../api/types';
import { EventCard } from '../components/EventCard';
import { FilterBar, type FilterValue } from '../components/FilterBar';
import { colors } from '../theme';
import { PosterDiscovery } from '../components/PosterDiscovery';

interface Props {
  onSavePosterEvent: (id: string) => Promise<void>;
  onOpenPosterEvent: (id: string) => void;
  events: EventSummary[];
  query: string;
  when: 'any' | 'today' | 'weekend';
  total: number;
  hasMore: boolean;
  moreError: string;
  onSearch: (value: string) => void;
  onWhenChange: (value: 'any' | 'today' | 'weekend') => void;
  onLoadMore: () => void;
  filter: FilterValue;
  loading: boolean;
  offline: boolean;
  savedIds: Set<string>;
  onFilterChange: (value: FilterValue) => void;
  onRefresh: () => void;
  onSelect: (event: EventSummary) => void;
  onToggleSaved: (id: string) => void;
}

export function FeedScreen(props: Props) {
  const [search, setSearch] = useState(props.query);
  useEffect(() => setSearch(props.query), [props.query]);
  return (
    <FlatList
      testID="event-feed"
      data={props.events}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl refreshing={props.loading} onRefresh={props.onRefresh} />}
      ListHeaderComponent={
        <>
          <View style={styles.header}>
            <View>
              <Text style={styles.eyebrow}>CITYPULSE · 长沙</Text>
              <Text style={styles.title}>这座城，{`\n`}正在发生</Text>
            </View>
          </View>
          <PosterDiscovery onSave={props.onSavePosterEvent} onOpen={props.onOpenPosterEvent} />
          {props.offline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineText}>活动数据暂不可用 · 连接服务后下拉刷新</Text>
              <Pressable accessibilityRole="button" onPress={props.onRefresh}><Text style={styles.offlineText}>重新加载</Text></Pressable>
            </View>
          )}
          <View style={styles.filterWrap}>
            <View style={styles.searchRow}>
              <TextInput accessibilityLabel="搜索活动" placeholder="搜索活动、场馆或关键词" value={search} onChangeText={setSearch}
                returnKeyType="search" onSubmitEditing={() => props.onSearch(search.trim())} style={styles.searchInput} />
              <Pressable accessibilityRole="button" onPress={() => props.onSearch(search.trim())}><Text style={styles.searchButton}>搜索</Text></Pressable>
              {!!search && <Pressable accessibilityRole="button" onPress={() => { setSearch(''); props.onSearch(''); }}><Text style={styles.searchButton}>清除搜索</Text></Pressable>}
            </View>
            <View style={styles.dateRow}>{(['any', 'today', 'weekend'] as const).map((value) =>
              <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: props.when === value }} onPress={() => props.onWhenChange(value)}
                style={[styles.dateChip, props.when === value && { backgroundColor: colors.mint }]}><Text>{{ any: '不限日期', today: '今天', weekend: '本周末' }[value]}</Text></Pressable>)}</View>
            <Text style={{ color: colors.inkMuted, marginHorizontal: 20, fontSize: 12 }}>日期按北京时间计算</Text>
            <FilterBar value={props.filter} onChange={props.onFilterChange} />
          </View>
          <Text style={styles.sectionTitle}>{props.filter === 'past' ? '往期活动' : '近期精选'}</Text>
          <Text style={styles.sectionCount}>已显示 {props.events.length} / {props.total} 个{props.filter === 'past' ? '已结束的已审核活动' : '仍在有效期内的城市动态'}</Text>
        </>
      }
      ListEmptyComponent={
        props.loading ? (
          <ActivityIndicator color={colors.orange} size="large" style={styles.loader} />
        ) : (
          <View>
            <Text style={styles.empty}>{props.offline ? '暂时无法加载活动。' : props.filter === 'past' ? '暂无已审核的往期活动。' : '这个筛选下还没有已审核的活动。'}</Text>
            {!props.offline && props.filter !== 'past' && <Pressable accessibilityRole="button" onPress={() => props.onFilterChange('past')}>
              <Text style={styles.pastLink}>已结束的活动请查看「往期活动」 →</Text>
            </Pressable>}
          </View>
        )
      }
      renderItem={({ item }) => (
        <EventCard
          event={item}
          saved={props.savedIds.has(item.id)}
          onPress={() => props.onSelect(item)}
          onToggleSaved={() => props.onToggleSaved(item.id)}
        />
      )}
      ListFooterComponent={<View style={styles.footerSpace}>
        {!!props.moreError && <Text accessibilityRole="alert" style={styles.offlineText}>{props.moreError}</Text>}
        {props.hasMore && <Pressable accessibilityRole="button" disabled={props.loading} onPress={props.onLoadMore}><Text style={styles.pastLink}>{props.loading ? '正在加载…' : '加载更多'}</Text></Pressable>}
      </View>}
    />
  );
}

const styles = StyleSheet.create({
  searchRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8, paddingHorizontal: 20, marginTop: 12 },
  searchInput: { flex: 1, minWidth: 140, padding: 12, backgroundColor: colors.white, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  searchButton: { color: colors.green, fontWeight: '700', padding: 8 },
  dateRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 20, marginVertical: 10 },
  dateChip: { padding: 10, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  content: { paddingHorizontal: 20, backgroundColor: colors.paper },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingTop: 20,
    paddingBottom: 18,
  },
  eyebrow: { fontSize: 11, fontWeight: '900', color: colors.orange, letterSpacing: 1.8 },
  title: { color: colors.ink, fontSize: 38, lineHeight: 43, fontWeight: '900', marginTop: 8 },
  cityButton: {
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: 999,
  },
  cityText: { color: colors.ink, fontWeight: '800', fontSize: 13 },
  signalCard: {
    backgroundColor: colors.ink,
    borderRadius: 20,
    padding: 17,
    flexDirection: 'row',
    marginBottom: 8,
  },
  signalIcon: { color: colors.yellow, fontSize: 32, fontWeight: '900', marginRight: 13 },
  signalCopy: { flex: 1 },
  signalTitle: { color: colors.white, fontWeight: '900', fontSize: 15 },
  signalText: { color: '#C8D4D0', fontSize: 12, lineHeight: 18, marginTop: 5 },
  offlineBanner: { backgroundColor: '#FFF0C8', padding: 10, borderRadius: 12, marginTop: 8 },
  offlineText: { color: '#705B20', fontSize: 12, fontWeight: '700', textAlign: 'center' },
  filterWrap: { marginHorizontal: -20, marginTop: 5 },
  sectionTitle: { color: colors.ink, fontSize: 23, fontWeight: '900', marginTop: 20 },
  sectionCount: { color: colors.inkMuted, fontSize: 13, marginTop: 4, marginBottom: 14 },
  loader: { marginTop: 60 },
  empty: { color: colors.inkMuted, textAlign: 'center', marginTop: 60 },
  pastLink: { color: colors.green, textAlign: 'center', padding: 16 },
  footerSpace: { height: 100 },
});
