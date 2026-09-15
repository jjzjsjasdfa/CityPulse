import { useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { appNow } from '../demo';

export function useMapClock() {
  const [now, setNow] = useState(appNow);
  useEffect(() => {
    const timer = setInterval(() => setNow(appNow()), 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(appNow());
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  return now;
}
