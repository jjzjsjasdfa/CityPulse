import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { candidateComparison } from '../api/client';
import type { CandidateComparison } from '../api/types';
import { eventFields } from './EventFields';
import { colors } from '../theme';

export function SourceComparison({ candidateId, version }: { candidateId: string; version: string }) {
  const [result, setResult] = useState<CandidateComparison | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setResult(null); setError('');
    candidateComparison(candidateId).then((value) => { if (active) setResult(value); })
      .catch(() => { if (active) setError('无法加载来源变化，请刷新候选后重试。'); });
    return () => { active = false; };
  }, [candidateId, version]);
  return <View style={{ padding: 12, backgroundColor: colors.mint, marginVertical: 12 }}>
    <Text style={{ fontWeight: '800' }}>最新来源与上次公开内容的差异</Text>
    <Text>以下为采集值，不代表已核实；缺失值也需要重新确认。</Text>
    {error ? <Text>{error}</Text> : !result ? <Text>正在加载差异…</Text> : result.changes.length === 0 ? <Text>可比较字段没有变化。</Text> : result.changes.map((change) => <View key={change.field} style={{ marginTop: 10 }}>
      <Text style={{ fontWeight: '700' }}>{eventFields.find(([key]) => key === change.field)?.[1] ?? change.field}</Text>
      <Text selectable>上次公开：{change.before ?? '未提供'}</Text>
      <Text selectable>最新来源：{change.after ?? '未提供'}</Text>
    </View>)}
  </View>;
}
