import { Text, View } from 'react-native';
import type { DateTimeProps } from './DateTimeInput';

export function DateTimeInput({ value, onChange, label, disabled, invalid }: DateTimeProps) {
  const instant = Date.parse(value);
  const local = Number.isFinite(instant) ? new Date(instant + 8 * 3600000).toISOString().slice(0, 16) : '';
  return <View>
    <input type="datetime-local" aria-label={label} disabled={disabled} value={local}
      onChange={(event) => onChange(event.target.value ? `${event.target.value}:00+08:00` : '')}
      style={{ boxSizing: 'border-box', width: '100%', minWidth: 0, padding: 12, fontSize: 16, border: `1px solid ${invalid ? '#A12626' : '#DCD8CE'}`, borderRadius: 10 }} />
    <Text style={{ color: '#60716C', marginTop: 4 }}>北京时间（UTC+08:00）</Text>
  </View>;
}
