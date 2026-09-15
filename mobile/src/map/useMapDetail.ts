import { useEffect, useRef, useState } from 'react';
import { mapDetail } from './presentation';

// One shared interpolation for the whole marker layer. New zoom input retargets
// the current frame, so reversing a pinch never restarts an animation at zero.
export function useMapDetail(widthKm: number) {
  const [detail, setDetail] = useState(() => mapDetail(widthKm));
  const current = useRef(detail);
  useEffect(() => {
    const target = mapDetail(widthKm);
    if (Math.max(Math.abs(current.current.name-target.name), Math.abs(current.current.category-target.category), Math.abs(current.current.unsaved-target.unsaved)) < 0.002) return;
    let frame = 0, last = 0;
    const tick = (time: number) => {
      const amount = 1 - Math.exp(-Math.min(last ? time - last : 16, 64) / 90);
      last = time;
      const previous = current.current;
      const next = { name: previous.name + (target.name - previous.name) * amount,
        category: previous.category + (target.category - previous.category) * amount,
        unsaved: previous.unsaved + (target.unsaved - previous.unsaved) * amount };
      const done = Math.max(...Object.keys(next).map((key) =>
        Math.abs(next[key as keyof typeof next] - target[key as keyof typeof target]))) < 0.002;
      current.current = done ? target : next;
      setDetail(current.current);
      if (!done) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [widthKm]);
  return detail;
}
