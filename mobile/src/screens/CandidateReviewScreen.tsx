import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Keyboard, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DraftControls, draftKey } from '../components/DraftControls';
import { EventFields, eventFields as fields, type EventDraft as Draft } from '../components/EventFields';
import { SourceComparison } from '../components/SourceComparison';

import { approveCandidate, enrichCandidate, listCandidates, rejectCandidate } from '../api/client';
import type { Candidate, CandidateApproval, CandidateStatus, EventStatus } from '../api/types';
import { categoryLabels, colors, statusLabels } from '../theme';

function candidateDraft(candidate: Candidate): Draft {
  return Object.fromEntries(fields.map(([key]) => [key,
    key === 'evidence_url' ? candidate.official_url :
    key in candidate ? String(candidate[key as keyof Candidate] ?? '') : '',
  ])) as Draft;
}
const labels: Record<CandidateStatus, string> = { pending: '待审核', approved: '已通过', rejected: '已拒绝' };

export function CandidateReviewScreen({ onPublished, userId }: { onPublished: () => void; userId: string }) {
  const [status, setStatus] = useState<CandidateStatus>('pending');
  const [offset, setOffset] = useState(0);
  const [items, setItems] = useState<Candidate[]>([]);
  const [selected, setSelected] = useState<Candidate | null>(null);
  const [draft, setDraft] = useState<Draft>({} as Draft);
  const [eventStatus, setEventStatus] = useState<EventStatus>('announced');
  const [busy, setBusy] = useState(false);
  const [enriching, setEnriching] = useState(false);
  const [enrichmentError, setEnrichmentError] = useState('');
  const [enrichmentNotice, setEnrichmentNotice] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [validation, setValidation] = useState<'approve' | 'reject' | null>(null);
  const [feedbackAttempt, setFeedbackAttempt] = useState(0);
  const [notice, setNotice] = useState('');
  const [revision, setRevision] = useState(0);
  const requestId = useRef(0);
  const scrollView = useRef<ScrollView>(null);
  const revealFeedback = useRef(false);
  const missingFields = validation ? fields.filter(([key]) =>
    (validation === 'approve' ? key !== 'price' : key === 'review_note') && !draft[key]?.trim(),
  ) : [];
  const feedback = missingFields.length
    ? `请补充：${missingFields.map(([, label]) => label).join('、')}`
    : submitError;
  useEffect(() => {
    const id = ++requestId.current;
    setLoading(true); setError(''); setItems([]);
    listCandidates(status, offset).then((result) => { if (id === requestId.current) setItems(result); })
      .catch((err) => { if (id === requestId.current) setError(err.message); })
      .finally(() => { if (id === requestId.current) setLoading(false); });
    return () => { requestId.current++; };
  }, [status, offset, revision]);

  const select = (candidate: Candidate) => {
    setSelected(candidate); setError(''); setNotice(''); setEventStatus('announced');
    setSubmitError(''); setValidation(null); revealFeedback.current = false;
    setEnrichmentError(''); setEnrichmentNotice('');
    setDraft(candidateDraft(candidate));
  };
  const enrich = async () => {
    if (!selected || enriching || busy) return;
    setEnriching(true); setEnrichmentError(''); setEnrichmentNotice('');
    try {
      const result = await enrichCandidate(selected);
      const before = candidateDraft(selected), after = candidateDraft(result);
      setDraft((current) => Object.fromEntries(fields.map(([key]) => [key,
        current[key] === before[key] ? after[key] : current[key],
      ])) as Draft);
      setSelected(result);
      setItems((current) => current.map((item) => item.id === result.id ? result : item));
      setEnrichmentNotice('已完成补采，手动修改的字段已保留，请核对补充结果。');
    } catch (err) { setEnrichmentError(err instanceof Error ? err.message : '补充失败，请重试'); }
    finally { setEnriching(false); }
  };
  const review = async (approve: boolean) => {
    if (!selected) return;
    Keyboard.dismiss();
    setSubmitError(''); setNotice(''); setValidation(approve ? 'approve' : 'reject');
    const missing = fields.filter(([key]) =>
      (approve ? key !== 'price' : key === 'review_note') && !draft[key]?.trim(),
    );
    if (missing.length) {
      revealFeedback.current = true;
      setFeedbackAttempt((attempt) => attempt + 1);
      return;
    }
    setBusy(true);
    try {
      if (approve) {
        const input: CandidateApproval = {
          ...draft, latitude: Number(draft.latitude), longitude: Number(draft.longitude),
          category: selected.category, status: eventStatus, price: draft.price || null,
          expected_updated_at: selected.updated_at,
        };
        await approveCandidate(selected.id, input);
      } else await rejectCandidate(selected, draft.review_note);
      void AsyncStorage.removeItem(draftKey(userId, selected.id)).catch(() => undefined);
      setSelected(null); setOffset(0); setRevision((value) => value + 1);
      setNotice(approve
        ? Date.parse(draft.ends_at) < Date.now()
          ? '审核通过，活动已公开。该活动已结束，可在发现页的「往期活动」中查看。'
          : '审核通过，活动已公开。'
        : '候选活动已拒绝。');
      onPublished();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : '审核失败，请重试');
      revealFeedback.current = true;
      setFeedbackAttempt((attempt) => attempt + 1);
    }
    finally { setBusy(false); }
  };
  return <ScrollView ref={scrollView} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>活动审核</Text>
    <Text style={styles.copy}>核对来源并补齐真实时间、地址、坐标和主办方后发布。</Text>
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.copy}>{notice}</Text>}
    {selected ? <>
      <Pressable accessibilityRole="button" disabled={busy || enriching} onPress={() => setSelected(null)}><Text style={styles.link}>← 返回列表</Text></Pressable>
      <Text style={styles.heading}>{selected.name}</Text>
      <Text style={styles.copy}>{categoryLabels[selected.category]} · {labels[selected.review_status]}</Text>
      <Pressable accessibilityRole="link" onPress={() => Linking.openURL(selected.official_url).catch(() => setError('无法打开来源链接'))}><Text style={styles.link}>查看采集来源 ↗</Text></Pressable>
      <Text selectable style={styles.copy}>{selected.official_url}</Text>
      {selected.review_status === 'pending' ? <>
        <DraftControls key={selected.id} storageKey={draftKey(userId, selected.id)} version={selected.updated_at}
          value={{ draft, eventStatus }} disabled={busy || enriching}
          onRestore={(saved) => { setDraft(saved.draft); setEventStatus(saved.eventStatus); }} />
        {selected.event_id && <SourceComparison candidateId={selected.id} version={selected.updated_at} />}
        <View style={styles.enrichment}>
          <Pressable accessibilityRole="button" disabled={busy || enriching} onPress={enrich} style={styles.chip}>
            <Text style={styles.heading}>{enriching ? '正在补充…' : '补充详情和地点'}</Text>
          </Pressable>
          <Text style={styles.copy}>优先读取来源详情；位置缺失时按候选活动的城市和场馆名查询。匹配结果仍需核实。</Text>
          {!!enrichmentError && <Text accessibilityRole="alert" style={styles.error}>{enrichmentError}</Text>}
          {!!enrichmentNotice && <Text accessibilityLiveRegion="polite" style={styles.copy}>{enrichmentNotice}</Text>}
          {selected.enrichment?.time_text && <Text selectable style={styles.copy}>来源时间：{selected.enrichment.time_text}</Text>}
          {selected.enrichment?.location_method && <Text style={styles.copy}>
            地点来源：{selected.enrichment.location_method === 'showstart' ? '秀动场馆详情' : '高德地点查询'}；坐标已近似转换为 WGS84，请在地图上核对。
          </Text>}
          {selected.enrichment?.warnings?.map((warning) => <Text key={warning} style={styles.error}>{warning}</Text>)}
          {selected.enrichment?.place_matches?.map((place) => <View key={place.id} style={styles.card}>
            <Text style={styles.heading}>{place.name}</Text>
            <Text selectable style={styles.copy}>{place.address}</Text>
            <Pressable accessibilityRole="button" disabled={busy || enriching} onPress={() => {
              setDraft((current) => ({ ...current, venue_name: place.name, address: place.address,
                city: place.city.replace(/市$/, ''), district: place.district,
                latitude: String(place.latitude), longitude: String(place.longitude) }));
              setEnrichmentNotice(`已将「${place.name}」填入审核表单，提交审核后保存。`);
            }}><Text style={styles.link}>使用此地点</Text></Pressable>
          </View>)}
        </View>
        <EventFields draft={draft} source={candidateDraft(selected)} disabled={busy || enriching}
          missing={missingFields.map(([key]) => key)} onChange={(key, value) => {
            setDraft((current) => ({ ...current, [key]: value })); setSubmitError('');
          }} />
        <Text style={styles.label}>活动状态</Text>
        {Date.parse(draft.ends_at) < Date.now() && <Text style={styles.copy}>该活动已结束。通过后将显示在发现页的「往期活动」，不会出现在近期活动中。</Text>}
        <View style={styles.row}>{(Object.keys(statusLabels) as EventStatus[]).map((value) =>
          <Pressable accessibilityRole="button" accessibilityState={{ selected: eventStatus === value }} key={value} disabled={busy} style={[styles.chip, eventStatus === value && styles.active]} onPress={() => setEventStatus(value)}><Text>{statusLabels[value]}</Text></Pressable>)}</View>
        <View style={styles.row}>
          <Pressable accessibilityRole="button" disabled={busy || enriching} style={styles.button} onPress={() => review(true)}><Text style={styles.buttonText}>{busy ? '处理中…' : '通过并公开'}</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy || enriching} style={styles.chip} onPress={() => review(false)}><Text style={styles.error}>拒绝</Text></Pressable>
        </View>
        {!!feedback && <View key={feedbackAttempt} testID="review-submit-feedback" style={styles.feedback}
          onLayout={() => {
            if (revealFeedback.current) {
              revealFeedback.current = false;
              scrollView.current?.scrollToEnd({ animated: true });
            }
          }}>
          <Text accessibilityRole="alert" accessibilityLiveRegion="assertive" style={styles.feedbackTitle}>未能提交审核</Text>
          <Text style={styles.feedbackText}>{feedback}</Text>
        </View>}
      </> : <>
        <Text style={styles.copy}>审核时间：{selected.reviewed_at}</Text>
        <Text style={styles.copy}>审核记录：{selected.review_note}</Text>
        {selected.event_id && <Text selectable style={styles.copy}>公开活动 ID：{selected.event_id}</Text>}
      </>}
    </> : <>
      <View style={styles.row}>{(Object.keys(labels) as CandidateStatus[]).map((value) =>
        <Pressable accessibilityRole="button" accessibilityState={{ selected: status === value }} key={value} style={[styles.chip, status === value && styles.active]} onPress={() => { setStatus(value); setOffset(0); }}><Text>{labels[value]}</Text></Pressable>)}</View>
      <Pressable accessibilityRole="button" onPress={() => setRevision((value) => value + 1)}><Text style={styles.link}>刷新队列</Text></Pressable>
      {loading ? <ActivityIndicator color={colors.orange} /> : items.length === 0 ? <Text style={styles.copy}>暂无{labels[status]}的候选活动。</Text> : items.map((candidate) =>
        <Pressable accessibilityRole="button" key={candidate.id} onPress={() => select(candidate)} style={styles.card}>
          <Text style={styles.heading}>{candidate.name}</Text>
          <Text style={styles.copy}>{candidate.venue_name ?? '待补充场馆'} · {candidate.price ?? '票价待核实'}</Text>
          <Text style={styles.copy}>{candidate.starts_at ?? '待补充活动时间'}</Text>
        </Pressable>)}
      <View style={styles.row}>
        <Pressable accessibilityRole="button" disabled={offset === 0 || loading} onPress={() => setOffset(Math.max(0, offset - 20))}><Text style={styles.link}>上一页</Text></Pressable>
        <Text style={styles.copy}>第 {offset / 20 + 1} 页</Text>
        <Pressable accessibilityRole="button" disabled={items.length < 20 || loading} onPress={() => setOffset(offset + 20)}><Text style={styles.link}>下一页</Text></Pressable>
      </View>
    </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 80, width: '100%', maxWidth: 820, alignSelf: 'center' },
  title: { fontSize: 30, fontWeight: '900', color: colors.ink, marginBottom: 12 },
  heading: { fontSize: 18, fontWeight: '800', color: colors.ink },
  copy: { color: colors.inkMuted, marginVertical: 8, lineHeight: 22 },
  label: { color: colors.ink, fontWeight: '700', marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, backgroundColor: colors.white, padding: 12, color: colors.ink },
  invalidInput: { borderColor: '#A12626' },
  fieldError: { color: '#A12626', marginTop: 6, fontSize: 12 },
  feedback: { backgroundColor: '#FFF1ED', borderWidth: 1, borderColor: '#E7B8AC', borderRadius: 12, padding: 14, marginTop: 4 },
  feedbackTitle: { color: '#A12626', fontWeight: '800', marginBottom: 6 },
  feedbackText: { color: '#A12626', lineHeight: 22 },
  enrichment: { padding: 14, borderRadius: 12, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.line, marginVertical: 12 },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center', marginVertical: 12 },
  chip: { borderWidth: 1, borderColor: colors.line, padding: 12, borderRadius: 12 },
  active: { backgroundColor: colors.mint },
  button: { backgroundColor: colors.orange, padding: 15, borderRadius: 12 },
  buttonText: { color: colors.white, fontWeight: '800' },
  card: { backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 16, padding: 16, marginVertical: 8 },
  link: { color: colors.green, paddingVertical: 12, fontWeight: '700' },
  error: { color: '#A12626', marginVertical: 8 },
});
