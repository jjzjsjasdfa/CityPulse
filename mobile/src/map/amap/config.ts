// Only the public JS API key belongs in the client. The security code belongs
// behind the official AMap serviceHost proxy, never in EXPO_PUBLIC_* variables.
export const amapConfig = {
  key: process.env.EXPO_PUBLIC_AMAP_JS_KEY ?? '',
  serviceHost: process.env.EXPO_PUBLIC_AMAP_SERVICE_HOST ?? '',
  style: process.env.EXPO_PUBLIC_AMAP_STYLE_ID
    ? `amap://styles/${process.env.EXPO_PUBLIC_AMAP_STYLE_ID}` : 'amap://styles/whitesmoke',
};
export function amapBaseUrl() {
  try { const url = new URL(amapConfig.serviceHost); return ['http:', 'https:'].includes(url.protocol) ? url.origin + '/' : undefined; }
  catch { return undefined; }
}
export const amapConfigured = Boolean(amapConfig.key && amapBaseUrl());
export const MAP_PAPER = '#F8F9FA';
