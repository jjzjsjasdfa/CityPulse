import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const key = 'citypulse.session.v1';
// Native credentials use Keychain/Keystore. Web storage is scoped to this origin.
export async function readSession(): Promise<string | null> {
  return Platform.OS === 'web' ? window.localStorage.getItem(key) : SecureStore.getItemAsync(key);
}
export async function writeSession(value: string | null): Promise<void> {
  if (Platform.OS === 'web') {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } else if (value === null) await SecureStore.deleteItemAsync(key);
  else await SecureStore.setItemAsync(key, value);
}
