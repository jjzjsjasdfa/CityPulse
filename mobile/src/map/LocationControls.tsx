import { Pressable, StyleSheet, Text, View } from 'react-native';
import { scaleBar } from './geo';
import type { MapRegion } from './presentation';
import type { LocationStatus } from './useDeviceLocation';
import { colors } from '../theme';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export function UserLocationDot() {
  return <View style={styles.halo} collapsable={false}><View style={styles.dot} /></View>;
}

export function LocationControls({ region, width, status, onRecenter, showScale = true }: {
  region: MapRegion; width: number; status: LocationStatus; onRecenter: () => void; showScale?: boolean;
}) {
  const scale = scaleBar(region, Math.max(1, width));
  const insets = useSafeAreaInsets();
  return <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
    {showScale && <View style={[styles.scale,{bottom:insets.bottom+92}]} pointerEvents="none" testID="map-scale">
      <Text style={styles.scaleLabel}>{scale.label}</Text>
      <View testID="map-scale-line" style={[styles.scaleLine, { width: scale.width }]} />
    </View>}
    <Pressable accessibilityRole="button" accessibilityLabel={status === 'ready' ? '回到我的位置' : '开启定位'}
      style={[styles.recenter,{bottom:insets.bottom+92}]} onPress={onRecenter}>
      <Text style={styles.locateIcon}>◎</Text>
    </Pressable>
  </View>;
}

export const locationStatusText = (status: LocationStatus) => ({
  locating: '正在获取你的位置…', ready: '留意边缘色彩 · 发现附近7公里的新活动',
  denied: '定位未授权 · 可点击定位按钮开启', unavailable: '暂时无法定位 · 可点击定位按钮重试',
})[status];

const styles = StyleSheet.create({
  halo: { width: 32, height: 32, borderRadius: 16, backgroundColor: 'rgba(46,126,235,0.16)', alignItems: 'center', justifyContent: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, backgroundColor: '#287DE3', borderWidth: 3, borderColor: '#FFFFFF' },
  scale: { position: 'absolute', bottom: 26, left: 18, alignItems: 'center', backgroundColor: 'rgba(255,253,248,0.82)', padding: 6, borderRadius: 6 },
  scaleLabel: { color: colors.ink, fontSize: 10, fontWeight: '700', marginBottom: 3 },
  scaleLine: { height: 5, borderLeftWidth: 1.5, borderRightWidth: 1.5, borderBottomWidth: 1.5, borderColor: colors.ink },
  recenter: { position: 'absolute', bottom: 26, right: 18, width: 44, height: 44, backgroundColor: colors.white, borderRadius: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.line },
  locateIcon: { color: '#287DE3', fontSize: 29, lineHeight: 32 },
});
