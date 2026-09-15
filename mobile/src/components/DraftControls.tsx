import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { colors } from '../theme';

export const draftKey = (userId: string, recordId: string) => `@citypulse/review-draft/${userId}/${recordId}`;
export function DraftControls<T>({ storageKey, version, value, onRestore, disabled }: {
  storageKey: string; version: string; value: T; onRestore: (value: T) => void; disabled?: boolean;
}) {
  const [saved, setSaved] = useState<{ version: string; value: T } | null>(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let active = true;
    setSaved(null); setMessage('');
    AsyncStorage.getItem(storageKey).then((raw) => { if (active && raw) setSaved(JSON.parse(raw)); })
      .catch(() => { if (active) setMessage('无法读取本机草稿。'); });
    return () => { active = false; };
  }, [storageKey]);
  return <View style={{ paddingVertical: 12, gap: 8 }}>
    <Text>草稿仅保存在当前设备，点击保存后可在下次审核时恢复。</Text>
    <Pressable accessibilityRole="button" disabled={disabled} onPress={async () => {
      try { const entry = { version, value }; await AsyncStorage.setItem(storageKey, JSON.stringify(entry)); setSaved(entry); setMessage('草稿已保存到本机。'); }
      catch { setMessage('草稿保存失败，请重试。'); }
    }}><Text style={{ color: colors.green }}>保存草稿</Text></Pressable>
    {saved && saved.version === version && <Pressable accessibilityRole="button" disabled={disabled} onPress={() => { onRestore(saved.value); setMessage('已恢复草稿，请核对后提交。'); }}><Text style={{ color: colors.green }}>恢复草稿</Text></Pressable>}
    {saved && saved.version !== version && <>
      <Text>来源或活动已更新，旧草稿不会自动覆盖新数据。请参考以下旧内容重新核对：</Text>
      <Text selectable>{JSON.stringify(saved.value, null, 2)}</Text>
    </>}
    {saved && <Pressable accessibilityRole="button" disabled={disabled} onPress={async () => {
      try { await AsyncStorage.removeItem(storageKey); setSaved(null); setMessage('已删除本机草稿。'); }
      catch { setMessage('无法删除草稿。'); }
    }}><Text style={{ color: colors.green }}>删除草稿</Text></Pressable>}
    {!!message && <Text accessibilityLiveRegion="polite">{message}</Text>}
  </View>;
}
