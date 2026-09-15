import MapView, { Marker } from 'react-native-maps';
import { Text, View } from 'react-native';

export interface PreviewProps { latitude: string; longitude: string }
export function LocationPreview({ latitude, longitude }: PreviewProps) {
  const lat = Number(latitude), lon = Number(longitude);
  if (!latitude.trim() || !longitude.trim() || !Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return <View style={{ height: 260 }}><Text>补齐有效坐标后可预览地点。</Text></View>;
  return <View style={{ height: 260 }}><Text>地点预览 · 请核对标记是否位于实际场馆</Text>
    <MapView style={{ height: 220, marginVertical: 10 }} region={{ latitude: lat, longitude: lon, latitudeDelta: 0.015, longitudeDelta: 0.015 }}>
      <Marker coordinate={{ latitude: lat, longitude: lon }} />
    </MapView>
  </View>;
}
