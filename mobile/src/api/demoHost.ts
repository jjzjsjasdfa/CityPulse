/** Expo Go must contact the development computer, not the phone's localhost. */
export function demoApiURL(override: string | undefined, hostUri: string | undefined, platform: string, webHostname?: string) {
  if (override?.trim()) return override.trim().replace(/\/+$/, '');
  let hostname = platform === 'web' ? webHostname : undefined;
  if (!hostname && hostUri) {
    try {
      hostname = new URL(hostUri.includes('://') ? hostUri : `http://${hostUri}`).hostname;
    } catch { /* Fall back for an offline bundle without a valid development host. */ }
  }
  hostname ||= platform === 'android' ? '10.0.2.2' : 'localhost';
  return `http://${hostname}:18082/api/v1`;
}
