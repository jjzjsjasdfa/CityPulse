import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { MapEvent } from '../api/types';
import { categoryColors, categoryLabels, colors, formatDate } from '../theme';

interface Props {
  points: MapEvent[];
  onBoundsChange: (bounds: { west: number; south: number; east: number; north: number }) => void;
  onSelectId: (id: string) => void;
}

export function MapScreen({ points, onSelectId }: Props) {
  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View>
          <Text style={styles.eyebrow}>附近正在发生</Text>
          <Text style={styles.title}>长沙地图</Text>
        </View>
        <View style={styles.countPill}><Text style={styles.countText}>{points.length} 个点位</Text></View>
      </View>
      <View style={styles.map}>
        <View style={styles.river} />
        {points.map((point, index) => (
          <Pressable
            key={point.id}
            onPress={() => onSelectId(point.id)}
            style={[
              styles.pin,
              {
                backgroundColor: categoryColors[point.category],
                left: `${14 + ((index * 21) % 68)}%`,
                top: `${20 + ((index * 17) % 57)}%`,
              },
            ]}
          >
            <Text style={styles.pinText}>{index + 1}</Text>
          </Pressable>
        ))}
        <Text style={styles.notice}>网页为示意底图 · 在 Expo Go 查看原生地图</Text>
      </View>
      <View style={styles.list}>
        {points.slice(0, 3).map((point) => (
          <Pressable key={point.id} onPress={() => onSelectId(point.id)} style={styles.listItem}>
            <View style={[styles.dot, { backgroundColor: categoryColors[point.category] }]} />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{point.name}</Text>
              <Text style={styles.meta}>{categoryLabels[point.category]} · {formatDate(point.starts_at)}</Text>
            </View>
          </Pressable>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper, paddingTop: 105 },
  header: {
    position: 'absolute', top: 18, left: 18, right: 18, flexDirection: 'row',
    justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.white,
    padding: 16, borderRadius: 19, borderWidth: 1, borderColor: colors.line,
  },
  eyebrow: { color: colors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 25, fontWeight: '900', marginTop: 3 },
  countPill: { backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  countText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  map: { height: 330, margin: 18, borderRadius: 24, backgroundColor: '#DCE5DF', overflow: 'hidden', borderWidth: 1, borderColor: colors.line },
  river: { position: 'absolute', width: 54, height: 440, backgroundColor: '#9BCAD0', left: '48%', top: -45, transform: [{ rotate: '8deg' }] },
  pin: { position: 'absolute', width: 36, height: 36, borderRadius: 18, borderWidth: 3, borderColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  pinText: { color: colors.white, fontWeight: '900' },
  notice: { position: 'absolute', bottom: 12, alignSelf: 'center', color: colors.ink, backgroundColor: 'rgba(255,253,248,0.88)', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, fontSize: 11 },
  list: { paddingHorizontal: 18 },
  listItem: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.white, padding: 14, borderRadius: 16, marginBottom: 9 },
  dot: { width: 11, height: 11, borderRadius: 6 },
  name: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  meta: { color: colors.inkMuted, fontSize: 12, marginTop: 3 },
});

