import { isAMapEnabled } from '../demo';
import { LocationPreview as AMapPreview, type PreviewProps } from './AMapLocationPreview';
import { LocationPreview as LegacyPreview } from './LegacyLocationPreview';
export type { PreviewProps } from './AMapLocationPreview';
export function LocationPreview(props: PreviewProps) {
  return isAMapEnabled() ? <AMapPreview {...props} /> : <LegacyPreview {...props} />;
}
