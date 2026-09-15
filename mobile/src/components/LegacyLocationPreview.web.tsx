import { Text, View } from 'react-native';
import type { PreviewProps } from './LocationPreview';

export function LocationPreview({ latitude, longitude }: PreviewProps) {
  const lat = Number(latitude), lon = Number(longitude);
  if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return <View style={{ height: 260 }}><Text>补齐有效坐标后可预览地点。</Text></View>;
  const params = new URLSearchParams({ bbox: `${Math.max(-180, lon - .01)},${Math.max(-90, lat - .01)},${Math.min(180, lon + .01)},${Math.min(90, lat + .01)}`, marker: `${lat},${lon}`, layer: 'mapnik' });
  return <View style={{ height: 260 }}><Text>地点预览 · 请核对标记是否位于实际场馆</Text>
    <iframe title="活动地点预览" loading="lazy" src={`https://www.openstreetmap.org/export/embed.html?${params}`} style={{ width: '100%', height: 220, border: 0, marginTop: 10 }} />
  </View>;
}
