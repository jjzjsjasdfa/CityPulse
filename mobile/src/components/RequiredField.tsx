import { Text } from 'react-native';
import { colors } from '../theme';

export function RequiredMark() {
  return <Text style={{ color: '#A12626' }} accessibilityLabel="必填"> *</Text>;
}

export function RequiredHint({ detail }: { detail?: string }) {
  return <Text style={{ color: colors.inkMuted, marginVertical: 8 }}>
    <RequiredMark /> 为必填项。{detail}
  </Text>;
}
