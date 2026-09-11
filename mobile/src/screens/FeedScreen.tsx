import { ActivityIndicator, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';

import type { EventSummary } from '../api/types';
import { EventCard } from '../components/EventCard';
import { FilterBar, type FilterValue } from '../components/FilterBar';
import { colors } from '../theme';

interface Props {
  events: EventSummary[];
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
  return (
    <FlatList
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
            <Pressable accessibilityRole="button" style={styles.cityButton}>
              <Text style={styles.cityText}>长沙⌄</Text>
            </Pressable>
          </View>
          <View style={styles.signalCard}>
            <Text style={styles.signalIcon}>⌁</Text>
            <View style={styles.signalCopy}>
              <Text style={styles.signalTitle}>事实优先，不让热度替你决定</Text>
              <Text style={styles.signalText}>每条活动都展示来源、状态与最近核验时间。</Text>
            </View>
          </View>
          {props.offline && (
            <View style={styles.offlineBanner}>
              <Text style={styles.offlineText}>当前展示本地演示数据 · 启动 API 后下拉刷新</Text>
            </View>
          )}
          <View style={styles.filterWrap}>
            <FilterBar value={props.filter} onChange={props.onFilterChange} />
          </View>
          <Text style={styles.sectionTitle}>近期精选</Text>
          <Text style={styles.sectionCount}>{props.events.length} 个仍在有效期内的城市动态</Text>
        </>
      }
      ListEmptyComponent={
        props.loading ? (
          <ActivityIndicator color={colors.orange} size="large" style={styles.loader} />
        ) : (
          <Text style={styles.empty}>这个筛选下还没有活动。</Text>
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
      ListFooterComponent={<View style={styles.footerSpace} />}
    />
  );
}

const styles = StyleSheet.create({
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
  footerSpace: { height: 100 },
});
