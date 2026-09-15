import { useEffect, useMemo, useState } from 'react';
import type { EventCategory } from '../api/types';
import { signalColors } from '../theme';
export const HALO_DURATION = 60000;
export function ActivityHalo({ id, category, until }: { id: string; category: EventCategory; until: number }) {
  const [expired, setExpired] = useState(() => until <= Date.now());
  const delay = useMemo(() => `${-Math.max(0, HALO_DURATION-(until-Date.now()))/1000}s`, [until]);
  useEffect(() => { setExpired(until <= Date.now()); const timer = setTimeout(() => setExpired(true), Math.max(0, until-Date.now())); return () => clearTimeout(timer); }, [until]);
  if (expired) return null;
  return <div data-testid={`activity-halo-${id}`} className="citypulse-halo-life" style={{position:'absolute',left:0,top:0,width:44,height:44,pointerEvents:'none',animationDelay:delay}}>
    <div className="citypulse-halo-pulse" style={{width:44,height:44,borderRadius:'50%',background:`radial-gradient(circle, ${signalColors[category]} 0%, ${signalColors[category]} 65%, ${signalColors[category]}00 100%)`,animationDelay:delay}} />
  </div>;
}
