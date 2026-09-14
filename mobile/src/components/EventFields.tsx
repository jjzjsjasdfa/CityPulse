import { Text, TextInput, View } from 'react-native';
import { DateTimeInput } from './DateTimeInput';
import { LocationPreview } from './LocationPreview';
import { colors } from '../theme';

export const eventFields = [
  ['name', '活动名称'], ['summary', '摘要'], ['description', '活动说明'],
  ['starts_at', '开始时间（含时区，例如 +08:00）'], ['ends_at', '结束时间（含时区）'],
  ['venue_name', '场馆'], ['address', '详细地址'], ['city', '城市'], ['district', '区'],
  ['latitude', '纬度（WGS84）'], ['longitude', '经度（WGS84）'], ['organizer', '主办方'],
  ['price', '票价（可选）'], ['evidence_url', '核验页面 URL'], ['review_note', '审核记录 / 拒绝原因'],
] as const;
export type EventField = typeof eventFields[number][0];
export type EventDraft = Record<EventField, string>;
export function EventFields({ draft, onChange, disabled, missing = [], source }: {
  draft: EventDraft; onChange: (field: EventField, value: string) => void;
  disabled?: boolean; missing?: EventField[]; source?: EventDraft;
}) {
  return <>
    {eventFields.map(([key, label]) => <View key={key}>
      <Text style={{ color: colors.ink, fontWeight: '700', marginTop: 12, marginBottom: 6 }}>{label}</Text>
      {source && key !== 'review_note' && <Text style={{ color: colors.inkMuted, marginBottom: 4 }}>
        {!source[key] ? '来源未提供 · 待人工核实' : draft[key] === source[key] ? '来源已采集 · 待核实' : '人工修改 · 请核对来源'}
      </Text>}
      {key === 'starts_at' || key === 'ends_at'
        ? <DateTimeInput label={label} value={draft[key]} disabled={disabled} invalid={missing.includes(key)} onChange={(value) => onChange(key, value)} />
        : <TextInput accessibilityLabel={label} editable={!disabled} value={draft[key]} autoCapitalize="none"
          multiline={['summary', 'description', 'review_note'].includes(key)} onChangeText={(value) => onChange(key, value)}
          style={{ borderWidth: 1, borderColor: missing.includes(key) ? '#A12626' : colors.line, borderRadius: 10, padding: 12, backgroundColor: colors.white, color: colors.ink }} />}
      {missing.includes(key) && <Text style={{ color: '#A12626', marginTop: 6 }}>请填写{label}</Text>}
    </View>)}
    <View style={{ marginVertical: 16 }}><LocationPreview latitude={draft.latitude} longitude={draft.longitude} /></View>
  </>;
}
