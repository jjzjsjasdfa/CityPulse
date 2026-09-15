import { useEffect, useRef, useState } from 'react';
import { WebView } from 'react-native-webview';
import { amapDocument } from './document';
import { amapBaseUrl } from './config';
import type { AMapSurfaceProps } from './types';

export function AMapSurface({ initialRegion, scene, camera, onMessage }: AMapSurfaceProps) {
  const view = useRef<WebView>(null);
  const [channel] = useState(() => `amap-${Math.random().toString(36).slice(2)}`);
  const [source] = useState(() => ({ html: amapDocument(initialRegion, channel),
    baseUrl: amapBaseUrl() }));
  const latest = useRef({ scene, camera, onMessage }); latest.current = { scene, camera, onMessage };
  const send = (data: object) => view.current?.injectJavaScript(`window.citypulseReceive && window.citypulseReceive(${JSON.stringify({ ...data, channel }).replace(/</g, '\\u003c')});true;`);
  useEffect(() => send({ type: 'scene', scene }), [scene]);
  useEffect(() => { if (camera) send({ type: 'camera', region: camera.region }); }, [camera]);
  return <WebView ref={view} source={source} style={{ flex: 1, backgroundColor: '#F8F9FA' }}
    originWhitelist={['*']} javaScriptEnabled scrollEnabled={false} bounces={false}
    setSupportMultipleWindows={false}
    onShouldStartLoadWithRequest={request => request.url === 'about:blank' || request.url.startsWith('about:srcdoc') || request.url === source.baseUrl}
    onLoadEnd={() => { send({ type: 'scene', scene: latest.current.scene }); if (latest.current.camera) send({ type: 'camera', region: latest.current.camera.region }); }}
    onError={() => onMessage({ type: 'error', message: '高德地图容器加载失败' })}
    onMessage={event => {
      try { const data = JSON.parse(event.nativeEvent.data); if (data.channel !== channel) return;
        if (data.type === 'ready') send({ type: 'scene', scene: latest.current.scene });
        latest.current.onMessage(data);
      } catch { /* Ignore messages that are not part of our map protocol. */ }
    }} />;
}
