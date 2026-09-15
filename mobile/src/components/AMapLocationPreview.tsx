import { useEffect, useMemo, useState } from 'react';
import { Text, View } from 'react-native';
import { AMapSurface } from '../map/amap/AMapSurface';
import { wgsToGcj } from '../map/amap/coordinates';
import type { AMapCommand } from '../map/amap/types';
export interface PreviewProps { latitude: string; longitude: string }
export function LocationPreview({ latitude, longitude }: PreviewProps) {
  const lat = Number(latitude), lon = Number(longitude);
  const valid = Boolean(latitude.trim() && longitude.trim() && Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180);
  const point = useMemo(() => wgsToGcj({latitude:valid ? lat : 28.2,longitude:valid ? lon : 112.96}), [valid,lat,lon]);
  const region = useMemo(() => ({...point,latitudeDelta:.015,longitudeDelta:.015}), [point]);
  const [camera, setCamera] = useState<AMapCommand>();
  useEffect(() => setCamera(old => ({id:(old?.id ?? 0)+1,region})), [region]);
  if (!valid) return <View style={{height:260}}><Text>补齐有效坐标后可预览地点。</Text></View>;
  return <View style={{height:260}}><Text>高德地点预览 · 请核对标记是否位于实际场馆</Text>
    <View style={{height:220,marginTop:10,position:'relative'}}>
      <AMapSurface initialRegion={region} camera={camera} scene={{pins:[{...point,id:'venue-preview',name:'活动场馆',category:'场馆',color:'#173232',signal:'#63CEFF',diameter:20,width:120,saved:false,unread:false,haloUntil:0,nameOpacity:1,categoryOpacity:0,opacity:1}],position:null,radius:0}} onMessage={() => {}} />
    </View>
  </View>;
}
