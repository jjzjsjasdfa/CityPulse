import { isAMapEnabled } from '../demo';
import { MapScreen as AMapScreen } from './AMapScreen';
import { MapScreen as LegacyMapScreen } from './LegacyMapScreen';
import type { MapScreenProps } from '../map/MapChrome';
export function MapScreen(props: MapScreenProps) {
  return isAMapEnabled() ? <AMapScreen {...props} /> : <LegacyMapScreen {...props} />;
}
