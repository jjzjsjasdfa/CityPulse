import { useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import type { MapEvent, NearbyEvent } from '../api/types';
import { apiFetch, demoURL } from '../api/client';
import { DEMO_MODE, nearbyRadius } from '../demo';
import type { Position } from './locationProvider';
import type { LocationStatus } from './useDeviceLocation';
import { locationStatusText } from './LocationControls';
import { categoryColors, categoryLabels, colors } from '../theme';
import { TIME_SIZES, type MapBounds, type MapLevel, type MapSession } from './presentation';

export interface MapScreenProps {
  session: MapSession;
  unreadIds: ReadonlySet<string>; haloUntil: Readonly<Record<string, number>>;
  onVisibleEvents: (ids: string[]) => void;
  points: MapEvent[]; savedIds: ReadonlySet<string>; loading: boolean; offline: boolean; incomplete: boolean;
  onBoundsChange: (bounds: MapBounds) => void; onSelectId: (id: string) => void;
  position: Position | null; locationStatus: LocationStatus; onLocate: () => void;
  newEvents: NearbyEvent[]; onSeenEvents: (ids: string[]) => void; updatesUnavailable: boolean;
  onDemoPublished?: () => void;
}
export function MapChrome({ offline, incomplete, locationStatus, updatesUnavailable, onDemoPublished }: {
  level: MapLevel; count: number; loading: boolean; offline: boolean; incomplete: boolean;
  locationStatus: LocationStatus; updatesUnavailable: boolean; onDemoPublished?: () => void;
}) {
  const [legendOpen, setLegendOpen] = useState(false);
  const insets = useSafeAreaInsets();
  const [demoOpen, setDemoOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [message, setMessage] = useState('');
  const publish = async () => {
    setPublishing(true);
    try {
      const response = await apiFetch(demoURL('/demo/publish'), { method: 'POST' });
      if (!response.ok) throw new Error();
      onDemoPublished?.(); setMessage('已更新周围 8 个方向的 16 条活动');
    } catch { setMessage('测试服务未连接，请稍后重试'); }
    finally { setPublishing(false); }
  };
  const notice = locationStatus !== 'ready' ? locationStatusText(locationStatus) : offline ?
    (DEMO_MODE ? '测试数据服务未连接' : '正式活动数据暂不可用') : incomplete ?
      '部分活动加载失败 · 移动地图重试' : updatesUnavailable ? '附近活动检查暂不可用 · 稍后自动重试' : '';
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {DEMO_MODE && <View style={[styles.demo,{top:insets.top+70}]} pointerEvents="box-none">
      <Pressable accessibilityRole="button" accessibilityLabel="虚构数据测试设置" onPress={() => setDemoOpen(!demoOpen)} style={styles.badge}>
        <Text style={styles.small}>虚构测试 · 五一广场 · {nearbyRadius()} 公里</Text>
      </Pressable>
      {demoOpen && <View style={styles.panel}>
        <Text style={styles.title}>200 条虚构活动</Text>
        <Text style={styles.body}>长沙 100 · 周边 50 · 省外 50</Text>
        <Text style={styles.body}>6 档时间均匀分配；定位固定在长沙五一广场。已预设 8 条测试收藏。</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="模拟附近新活动" disabled={publishing} style={styles.action} onPress={() => { void publish(); }}>
          <Text style={styles.actionText}>{publishing ? '更新中…' : '模拟附近新活动'}</Text>
        </Pressable>
        {message ? <Text style={styles.body}>{message}</Text> : null}
      </View>}
    </View>}
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
        <Text style={styles.body}>双指或滚轮缩放，逐渐显示类别和名称。{nearbyRadius() > 0 ? `边缘色彩指向定位周围 ${nearbyRadius()} 公里内的新活动。` : '新活动提示已关闭。'}</Text>
      </View>}
      <Pressable accessibilityRole="button" accessibilityLabel="地图图例" accessibilityState={{ expanded: legendOpen }}
        style={styles.info} onPress={() => setLegendOpen(!legendOpen)}><Text style={styles.infoText}>{legendOpen ? '×' : 'i'}</Text></Pressable>
    </View>
  </View>;
}
const styles = StyleSheet.create({
  demo: { position: 'absolute', top: 14, left: 14, gap: 8, alignItems: 'flex-start' },
  badge: { backgroundColor: 'rgba(255,253,248,0.92)', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16 },
  small: { color: colors.inkMuted, fontSize: 10 },
  panel: { width: 280, maxWidth: '100%', backgroundColor: colors.white, borderRadius: 18, padding: 14, gap: 10, borderWidth: 1, borderColor: colors.line },
  title: { fontSize: 13, fontWeight: '700', color: colors.ink },
  body: { fontSize: 11, lineHeight: 17, color: colors.inkMuted },
  action: { backgroundColor: colors.ink, padding: 12, borderRadius: 12, alignItems: 'center' },
  actionText: { color: colors.white, fontSize: 12, fontWeight: '700' },
  notice: { position: 'absolute', bottom: 140, left: 18, right: 18, fontSize: 11, textAlign: 'center', padding: 9, borderRadius: 10, backgroundColor: colors.white, color: colors.inkMuted },
  legendArea: { position: 'absolute', right: 18, bottom: 80, alignItems: 'flex-end', gap: 10 },
  info: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  infoText: { fontSize: 22, color: colors.inkMuted },
  categories: { flexDirection: 'row', flexWrap: 'wrap', rowGap: 10 },
  category: { width: '50%', flexDirection: 'row', alignItems: 'center', gap: 7 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  sizes: { flexDirection: 'row', justifyContent: 'space-between' },
});
