import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { EventSummary } from '../api/types';
import { EventCard } from '../components/EventCard';
import { colors } from '../theme';

interface Props {
  events: EventSummary[];
  savedIds: Set<string>;
  onSelect: (event: EventSummary) => void;
  onToggleSaved: (id: string) => void;
}

export function SavedScreen({ events, savedIds, onSelect, onToggleSaved }: Props) {
  const saved = events.filter((event) => savedIds.has(event.id));
  return (
    <FlatList
      data={saved}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.eyebrow}>YOUR CITY LIST</Text>
          <Text style={styles.title}>想去的地方</Text>
          <Text style={styles.subtitle}>收藏只保存在这台设备上，你可以随时取消。</Text>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>♡</Text>
          <Text style={styles.emptyTitle}>还没有收藏</Text>
          <Text style={styles.emptyText}>在信息流或详情页点一下心形，这里就会形成你的城市清单。</Text>
        </View>
      }
      renderItem={({ item }) => (
        <EventCard
          event={item}
          saved
          onPress={() => onSelect(item)}
          onToggleSaved={() => onToggleSaved(item.id)}
        />
      )}
      ListFooterComponent={<View style={{ height: 100 }} />}
    />
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, backgroundColor: colors.paper },
  header: { paddingTop: 24, paddingBottom: 22 },
  eyebrow: { color: colors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: colors.ink, fontSize: 36, fontWeight: '900', marginTop: 7 },
  subtitle: { color: colors.inkMuted, fontSize: 13, marginTop: 7 },
  empty: { alignItems: 'center', paddingHorizontal: 35, marginTop: 70 },
  emptyIcon: { color: colors.orange, fontSize: 58 },
  emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginTop: 12 },
  emptyText: { color: colors.inkMuted, textAlign: 'center', lineHeight: 21, marginTop: 8 },
});

