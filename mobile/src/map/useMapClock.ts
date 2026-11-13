import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

/** Returns a timestamp refreshed every 30 seconds and whenever the app becomes active. */
export function useMapClock() {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') setNow(Date.now());
    });
    return () => { clearInterval(timer); subscription.remove(); };
  }, []);
  return now;
}
