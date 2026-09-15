import { useEffect, useRef, useState } from 'react';
import { amapDocument } from './document';
import type { AMapSurfaceProps } from './types';

export function AMapSurface({ initialRegion, scene, camera, onMessage }: AMapSurfaceProps) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [channel] = useState(() => `amap-${Math.random().toString(36).slice(2)}`);
  const [html] = useState(() => amapDocument(initialRegion, channel));
  const latest = useRef({ scene, camera, onMessage }); latest.current = { scene, camera, onMessage };
  const send = (data: object) => frame.current?.contentWindow?.postMessage({ ...data, channel }, '*');
  useEffect(() => {
    const listener = (event: MessageEvent) => {
      if (event.source !== frame.current?.contentWindow || event.data?.channel !== channel) return;
      if (event.data.type === 'ready') send({ type: 'scene', scene: latest.current.scene });
      latest.current.onMessage(event.data);
    };
    window.addEventListener('message', listener); return () => window.removeEventListener('message', listener);
  }, [channel]);
  useEffect(() => send({ type: 'scene', scene }), [scene]);
  useEffect(() => { if (camera) send({ type: 'camera', region: camera.region }); }, [camera]);
  return <iframe ref={frame} title="高德活动地图" srcDoc={html} onLoad={() => {
    send({ type: 'scene', scene: latest.current.scene });
    if (latest.current.camera) send({ type: 'camera', region: latest.current.camera.region });
  }} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', border: 0 }} />;
}
