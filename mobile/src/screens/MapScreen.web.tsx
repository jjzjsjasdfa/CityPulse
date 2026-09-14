import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import type { MapEvent } from '../api/types';
import { colors, formatDate } from '../theme';

interface Props {
  points: MapEvent[];
  onBoundsChange: (bounds: { west: number; south: number; east: number; north: number }) => void;
  onSelectId: (id: string) => void;
}
const cityBounds = { west: 112.86, south: 28.10, east: 113.06, north: 28.32 };

export function MapScreen({ points, onBoundsChange, onSelectId }: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  useEffect(() => { onBoundsChange(cityBounds); }, [onBoundsChange]);
  const selected = points.find((point) => point.id === selectedId);
  const bounds = selected ? {
    west: selected.longitude - 0.02, south: selected.latitude - 0.02,
    east: selected.longitude + 0.02, north: selected.latitude + 0.02,
  } : cityBounds;
  const params = new URLSearchParams({ bbox: `${bounds.west},${bounds.south},${bounds.east},${bounds.north}`, layer: 'mapnik' });
  if (selected) params.set('marker', `${selected.latitude},${selected.longitude}`);
  return <ScrollView contentContainerStyle={styles.container}>
    <Text style={styles.title}>长沙地图</Text>
    <Text style={styles.copy}>选择活动，在地图中查看核验位置。</Text>
    <iframe title="长沙活动位置 · OpenStreetMap" src={`https://www.openstreetmap.org/export/embed.html?${params}`} style={{ width: '100%', height: 340, border: 0, borderRadius: 16 }} loading="lazy" />
    <View style={styles.row}>
      <Text style={styles.copy}>{points.length} 个活动 · 长沙中心城区</Text>
      <Pressable accessibilityRole="button" onPress={() => onBoundsChange(cityBounds)}><Text style={styles.link}>刷新活动</Text></Pressable>
    </View>
    {points.length === 0 && <Text style={styles.copy}>该区域暂无已审核的活动。</Text>}
    {points.map((point) => <View key={point.id} style={styles.card}>
      <Pressable accessibilityRole="button" onPress={() => setSelectedId(point.id)}>
        <Text style={styles.name}>{point.name}</Text>
        <Text style={styles.copy}>{formatDate(point.starts_at)} · 在地图中定位</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={() => onSelectId(point.id)}><Text style={styles.link}>活动详情 →</Text></Pressable>
    </View>)}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingBottom: 80 },
  title: { color: colors.ink, fontSize: 28, fontWeight: '900' },
  copy: { color: colors.inkMuted, marginVertical: 10, lineHeight: 20 },
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' },
  card: { padding: 16, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, borderRadius: 16, marginBottom: 10 },
  name: { color: colors.ink, fontSize: 16, fontWeight: '800' },
  link: { color: colors.green, fontWeight: '700', paddingVertical: 10 },
});
