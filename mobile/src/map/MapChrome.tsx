import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MapEvent, NearbyEvent } from '../api/types';
import type { Position } from './locationProvider';
import type { LocationStatus } from './useDeviceLocation';
import { locationStatusText } from './LocationControls';
import { categoryColors, categoryLabels, colors } from '../theme';
import { TIME_SIZES, type MapBounds, type MapLevel, type MapSession } from './presentation';

export interface MapScreenProps {
  /** State kept across tab remounts during the current app launch. */
  session: MapSession;
  /** Alert marker state and callback for markers currently visible on screen. */
  unreadIds: ReadonlySet<string>; haloUntil: Readonly<Record<string, number>>;
  onVisibleEvents: (ids: string[]) => void;
  /** Map data, saved IDs, and loading/error state supplied by the app shell. */
  points: MapEvent[]; savedIds: ReadonlySet<string>; loading: boolean; offline: boolean; incomplete: boolean;
  /** Camera-change and marker-selection callbacks. */
  onBoundsChange: (bounds: MapBounds) => void; onSelectId: (id: string) => void;
  /** Device location state and its retry action. */
  position: Position | null; locationStatus: LocationStatus; onLocate: () => void;
  /** Nearby-update events, acknowledgement callback, and polling availability. */
  newEvents: NearbyEvent[]; onSeenEvents: (ids: string[]) => void; updatesUnavailable: boolean;
}
/** Displays map notices and the expandable legend for loading/location error states. */
export function MapChrome({ offline, incomplete, locationStatus, updatesUnavailable }: {
  level: MapLevel; count: number; loading: boolean; offline: boolean; incomplete: boolean;
  locationStatus: LocationStatus; updatesUnavailable: boolean;
}) {
  const [legendOpen, setLegendOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const notice = locationStatus !== 'ready' ? locationStatusText(locationStatus) : offline ?
    '活动数据暂不可用' : incomplete ?
      '部分活动加载失败 · 移动地图重试' : updatesUnavailable ? '附近活动检查暂不可用 · 稍后自动重试' : '';
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {notice ? <Text style={styles.notice} pointerEvents="none">{notice}</Text> : null}
    <View style={[styles.legendArea,{bottom:insets.bottom+146}]} pointerEvents="box-none">
      {legendOpen && <View style={styles.panel}>
        <Text style={styles.title}>颜色看类别</Text>
        <View style={styles.categories}>{Object.entries(categoryLabels).map(([category, label]) =>
          <View key={category} style={styles.category}>
            <View style={[styles.dot, { backgroundColor: categoryColors[category as keyof typeof categoryColors] }]} />
            <Text style={styles.small}>{label}</Text>
          </View>)}</View>
        <Text style={styles.title}>大小看时间</Text>
        <View style={styles.sizes}>{TIME_SIZES.map((size) => <View key={size.key} style={{ alignItems: 'center' }}>
          <View style={{ height: 32, justifyContent: 'center' }}><View style={{ width: size.diameter, height: size.diameter, borderRadius: 20, backgroundColor: colors.green }} /></View>
          <Text style={styles.small}>{size.label}</Text>
        </View>)}</View>
        <Text style={styles.body}>双指或滚轮缩放，逐渐显示类别和名称。边缘色彩指向定位周围 7 公里内的新活动。</Text>
      </View>}
      <Pressable accessibilityRole="button" accessibilityLabel="地图图例" accessibilityState={{ expanded: legendOpen }}
        style={styles.info} onPress={() => setLegendOpen(!legendOpen)}><Text style={styles.infoText}>{legendOpen ? '×' : 'i'}</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  small: { color: colors.inkMuted, fontSize: 10 },
  panel: { width: 280, maxWidth: '100%', backgroundColor: colors.white, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line },
  title: { fontSize: 13, fontWeight: '700', color: colors.ink },
  body: { fontSize: 11, lineHeight: 17, color: colors.inkMuted },
  notice: { position: 'absolute', bottom: 140, left: 18, right: 18, fontSize: 11, textAlign: 'center', padding: 9, borderRadius: 10, backgroundColor: colors.white, color: colors.inkMuted },
  legendArea: { position: 'absolute', right: 18, bottom: 80, alignItems: 'flex-end', gap: 10 },
  info: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  infoText: { fontSize: 22, color: colors.inkMuted },
  categories: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  category: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  sizes: { flexDirection: 'row', justifyContent: 'space-between' },
});
