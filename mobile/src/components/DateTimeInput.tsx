import { Text, TextInput, View } from 'react-native';
import { colors } from '../theme';

export interface DateTimeProps { value: string; onChange: (value: string) => void; label: string; disabled?: boolean; invalid?: boolean }
export function shanghaiTime(value: string) {
  const instant = Date.parse(value);
  return Number.isFinite(instant) ? new Date(instant + 8 * 3600000).toISOString().slice(0, 16) : '';
}
export function DateTimeInput({ value, onChange, label, disabled, invalid }: DateTimeProps) {
  return <View>
    <TextInput accessibilityLabel={label} editable={!disabled} placeholder="2026-09-20 19:30"
      value={value.includes('T') ? shanghaiTime(value).replace('T', ' ') : value}
      onChangeText={(text) => onChange(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(text) ? `${text.replace(' ', 'T')}:00+08:00` : text)}
      style={{ padding: 12, borderWidth: 1, borderColor: invalid ? '#A12626' : colors.line, borderRadius: 10, backgroundColor: colors.white }} />
    <Text style={{ color: colors.inkMuted, marginTop: 4 }}>北京时间（UTC+08:00），格式：年-月-日 时:分</Text>
  </View>;
}
