import { StyleSheet, Text, View } from 'react-native';
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
});
