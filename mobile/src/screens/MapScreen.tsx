import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import MapView, { Marker, type Region } from 'react-native-maps';

import type { MapEvent } from '../api/types';
import { categoryColors, categoryLabels, colors, formatDate } from '../theme';

interface Props {
  points: MapEvent[];
  onBoundsChange: (bounds: { west: number; south: number; east: number; north: number }) => void;
  onSelectId: (id: string) => void;
}

const initialRegion: Region = {
  latitude: 28.2,
  longitude: 112.96,
  latitudeDelta: 0.1,
  longitudeDelta: 0.12,
};

const boundsFromRegion = (region: Region) => ({
  west: region.longitude - region.longitudeDelta / 2,
  south: region.latitude - region.latitudeDelta / 2,
  east: region.longitude + region.longitudeDelta / 2,
  north: region.latitude + region.latitudeDelta / 2,
});

export function MapScreen({ points, onBoundsChange, onSelectId }: Props) {
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webContainer}>
        <MapHeader count={points.length} />
        <View style={styles.webMap}>
          <View style={styles.river} />
          {points.map((point, index) => (
            <Pressable
              key={point.id}
              onPress={() => onSelectId(point.id)}
              style={[
                styles.webPin,
                {
                  backgroundColor: categoryColors[point.category],
                  left: `${14 + ((index * 21) % 68)}%`,
                  top: `${20 + ((index * 17) % 57)}%`,
                },
              ]}
            >
              <Text style={styles.webPinText}>{index + 1}</Text>
            </Pressable>
          ))}
          <Text style={styles.webNotice}>网页预览为示意底图 · 在 Expo Go 查看原生地图</Text>
        </View>
        <View style={styles.mapList}>
          {points.slice(0, 3).map((point) => (
            <Pressable key={point.id} onPress={() => onSelectId(point.id)} style={styles.mapListItem}>
              <View style={[styles.listDot, { backgroundColor: categoryColors[point.category] }]} />
              <View style={{ flex: 1 }}>
                <Text style={styles.mapListName}>{point.name}</Text>
                <Text style={styles.mapListMeta}>
                  {categoryLabels[point.category]} · {formatDate(point.starts_at)}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <MapView
        initialRegion={initialRegion}
        onMapReady={() => onBoundsChange(boundsFromRegion(initialRegion))}
        onRegionChangeComplete={(region) => onBoundsChange(boundsFromRegion(region))}
        style={StyleSheet.absoluteFill}
      >
        {points.map((point) => (
          <Marker
            key={point.id}
            coordinate={{ latitude: point.latitude, longitude: point.longitude }}
            description={`${categoryLabels[point.category]} · ${formatDate(point.starts_at)}`}
            onCalloutPress={() => onSelectId(point.id)}
            pinColor={categoryColors[point.category]}
            title={point.name}
          />
        ))}
      </MapView>
      <MapHeader count={points.length} />
      <View style={styles.mapHint}>
        <Text style={styles.mapHintText}>移动地图，只加载当前视口</Text>
      </View>
    </View>
  );
}

function MapHeader({ count }: { count: number }) {
  return (
    <View style={styles.header}>
      <View>
        <Text style={styles.eyebrow}>附近正在发生</Text>
        <Text style={styles.title}>长沙地图</Text>
      </View>
      <View style={styles.countPill}>
        <Text style={styles.countText}>{count} 个点位</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#DCE5DF' },
  header: {
    position: 'absolute',
    top: 18,
    left: 18,
    right: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,253,248,0.96)',
    padding: 16,
    borderRadius: 19,
    borderWidth: 1,
    borderColor: colors.line,
  },
  eyebrow: { color: colors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 1.5 },
  title: { color: colors.ink, fontSize: 25, fontWeight: '900', marginTop: 3 },
  countPill: { backgroundColor: colors.ink, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999 },
  countText: { color: colors.white, fontSize: 12, fontWeight: '800' },
  mapHint: {
    position: 'absolute',
    bottom: 18,
    alignSelf: 'center',
    backgroundColor: colors.ink,
    paddingHorizontal: 15,
    paddingVertical: 9,
    borderRadius: 999,
  },
  mapHintText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  webContainer: { flex: 1, backgroundColor: colors.paper, paddingTop: 105 },
  webMap: {
    height: 330,
    margin: 18,
    borderRadius: 24,
    backgroundColor: '#DCE5DF',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.line,
  },
  river: {
    position: 'absolute',
    width: 54,
    height: 440,
    backgroundColor: '#9BCAD0',
    left: '48%',
    top: -45,
    transform: [{ rotate: '8deg' }],
  },
  webPin: {
    position: 'absolute',
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: colors.white,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webPinText: { color: colors.white, fontWeight: '900' },
  webNotice: {
    position: 'absolute',
    bottom: 12,
    alignSelf: 'center',
    color: colors.ink,
    backgroundColor: 'rgba(255,253,248,0.88)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    fontSize: 11,
  },
  mapList: { paddingHorizontal: 18 },
  mapListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.white,
    padding: 14,
    borderRadius: 16,
    marginBottom: 9,
  },
  listDot: { width: 11, height: 11, borderRadius: 6 },
  mapListName: { color: colors.ink, fontWeight: '800', fontSize: 14 },
  mapListMeta: { color: colors.inkMuted, fontSize: 12, marginTop: 3 },
});

