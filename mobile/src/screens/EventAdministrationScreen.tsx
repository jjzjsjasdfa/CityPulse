import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { createAdminEvent, eventRevisions, getAdminCorrection, getAdminEvent, listCorrections, listAdminEvents, reviewCorrection, setAdminEventArchived, updateAdminEvent } from '../api/client';
import type { AdminEventCreate, AdminEventDetail, AdminEventSummary, AdminCorrection, AdminCorrectionSummary, EventRevision, AdminEventUpdate } from '../api/types';
import { DraftControls, draftKey } from '../components/DraftControls';
import { RequiredHint, RequiredMark } from '../components/RequiredField';
import { EventFields, eventFields, type EventDraft } from '../components/EventFields';
import { categoryLabels, colors, statusLabels } from '../theme';

const correctionLabels = { pending: '待处理', reviewing: '处理中', accepted: '已接受', rejected: '已拒绝' };
/** Converts an existing admin `event` into editable string fields. */
const eventDraft = (event: AdminEventDetail) => Object.fromEntries(eventFields.map(([key]) => [key,
  key === 'review_note' ? '' : String(event[key as keyof AdminEventDetail] ?? ''),
])) as EventDraft;
/** Creates the initial form values for a new event. */
const emptyEventDraft = () => Object.fromEntries(eventFields.map(([key]) => [key, key === 'city' ? '长沙' : ''])) as EventDraft;

/** Loads and renders paginated revision history for `event`. */
function History({ event }: { event: AdminEventDetail }) {
  const [rows, setRows] = useState<EventRevision[]>([]);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true; setError(''); setRows([]);
    eventRevisions(event.id, offset).then((value) => { if (active) setRows(value); })
      .catch(() => { if (active) setError('无法加载修改记录。'); });
    return () => { active = false; };
  }, [event.id, event.updated_at, offset]);
  return <View style={styles.card}>
    <Text style={styles.heading}>修改记录</Text>
    {!!error && <Text>{error}</Text>}
    {rows.map((row) => <View key={row.id} style={{ marginTop: 12 }}>
      <Text>{new Date(row.created_at).toLocaleString()} · {row.note}</Text>
      {Object.keys(row.after).filter((key) => !['updated_at', 'id'].includes(key) && row.before[key] !== row.after[key]).map((key) =>
        <Text selectable key={key}>{eventFields.find(([field]) => field === key)?.[1] ?? (key === 'is_published' ? '公开状态' : key)}：{String(row.before[key] ?? '未提供')} → {String(row.after[key] ?? '未提供')}</Text>)}
    </View>)}
    <Pager offset={offset} count={rows.length} onChange={setOffset} />
  </View>;
}

/** Moves through 20-row pages using current `offset`, row `count`, and `onChange`. */
function Pager({ offset, count, onChange }: { offset: number; count: number; onChange: (value: number) => void }) {
  return <View style={styles.row}>
    <Pressable accessibilityRole="button" disabled={offset === 0} onPress={() => onChange(Math.max(0, offset - 20))}><Text style={styles.link}>上一页</Text></Pressable>
    <Text>第 {offset / 20 + 1} 页</Text>
    <Pressable accessibilityRole="button" disabled={count < 20} onPress={() => onChange(offset + 20)}><Text style={styles.link}>下一页</Text></Pressable>
  </View>;
}

/** Creates or edits an event, optionally applying `correction`; callbacks leave or refresh. */
function EventEditor({ initial, correction, userId, onBack, onSaved }: {
  initial?: AdminEventDetail; correction?: AdminCorrection; userId: string; onBack: () => void; onSaved: () => void;
}) {
  const [event, setEvent] = useState(initial ?? null);
  const [draft, setDraft] = useState(() => initial ? eventDraft(initial) : emptyEventDraft());
  const [status, setStatus] = useState<AdminEventDetail['status']>(initial?.status ?? 'announced');
  const [category, setCategory] = useState<AdminEventDetail['category']>(initial?.category ?? 'performance');
  const [published, setPublished] = useState(initial?.is_published ?? false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [validate, setValidate] = useState(false);
  const scroll = useRef<ScrollView>(null);
  const storageKey = draftKey(userId, `event-${event?.id ?? 'new'}`);
  const missing = validate ? eventFields.filter(([key]) => key !== 'price' && !draft[key]?.trim()).map(([key]) => key) : [];
  /** Validates the form, then creates/updates the event or accepts its correction. */
  const save = async () => {
    setValidate(true); setError('');
    if (eventFields.some(([key]) => key !== 'price' && !draft[key]?.trim())) { setError('请补齐标记的必填项。'); return; }
    setBusy(true);
    try {
      const createBody: AdminEventCreate = { ...draft, status, category, is_published: published,
        latitude: Number(draft.latitude), longitude: Number(draft.longitude), price: draft.price || null };
      if (!event) await createAdminEvent(createBody);
      else {
        const body: AdminEventUpdate = { ...createBody, expected_updated_at: event.updated_at };
        if (correction) await reviewCorrection(correction.id, { expected_updated_at: correction.updated_at,
          status: 'accepted', resolution_note: draft.review_note, event_update: body });
        else await updateAdminEvent(event.id, body);
      }
      void AsyncStorage.removeItem(storageKey).catch(() => undefined);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : '保存失败，请重试。'); }
    finally { setBusy(false); }
  };
  /** Archives or restores the current event using the review note as audit context. */
  const changeArchiveState = async () => {
    if (!event) return;
    if (!draft.review_note.trim()) { setValidate(true); setError('请填写审核记录后再更改归档状态。'); return; }
    setBusy(true); setError('');
    try {
      await setAdminEventArchived(event.id, !event.archived_at, { expected_updated_at: event.updated_at, note: draft.review_note });
      void AsyncStorage.removeItem(storageKey).catch(() => undefined);
      onSaved();
    } catch (err) { setError(err instanceof Error ? err.message : '归档操作失败，请重试。'); }
    finally { setBusy(false); }
  };
  return <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable accessibilityRole="button" disabled={busy} onPress={onBack}><Text style={styles.link}>← 返回管理列表</Text></Pressable>
    <Text style={styles.title}>{event ? '编辑活动' : '新建活动'}</Text>
    {!!event?.archived_at && <Text style={styles.warning}>此活动已归档。恢复后仍保持下架，需要再次编辑才能公开。</Text>}
    {correction && <View style={styles.card}><Text style={styles.heading}>正在处理用户纠错</Text><Text selectable>{correction.message}</Text></View>}
    <DraftControls storageKey={storageKey} version={event?.updated_at ?? 'new'} value={{ draft, status, category, published }} disabled={busy}
      onRestore={(saved) => { setDraft(saved.draft); setStatus(saved.status); setCategory(saved.category); setPublished(saved.published); }} />
    <EventFields draft={draft} disabled={busy} missing={missing} onChange={(key, value) => { setDraft((current) => ({ ...current, [key]: value })); setError(''); }} />
    <Text style={styles.heading}>分类<RequiredMark /></Text>
    <View style={styles.row}>{(Object.keys(categoryLabels) as AdminEventDetail['category'][]).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: category === value }} disabled={busy} style={[styles.chip, value === category && styles.active]} onPress={() => setCategory(value)}><Text>{categoryLabels[value]}</Text></Pressable>)}</View>
    <Text style={styles.heading}>活动状态<RequiredMark /></Text>
    <Text>改期时请同时修改上方的开始、结束时间。取消的活动可以保留公开，以便用户看到取消通知。</Text>
    <View style={styles.row}>{(Object.keys(statusLabels) as AdminEventDetail['status'][]).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: status === value }} disabled={busy} style={[styles.chip, value === status && styles.active]} onPress={() => setStatus(value)}><Text>{statusLabels[value]}</Text></Pressable>)}</View>
    <Text style={styles.heading}>公开状态<RequiredMark /></Text>
    <View style={styles.row}>{[true, false].map((value) => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: published === value }} disabled={busy || Boolean(event?.archived_at && value)} onPress={() => setPublished(value)} style={[styles.chip, published === value && styles.active]}><Text>{value ? '公开' : '下架'}</Text></Pressable>)}</View>
    <Text>保存后：{published ? '用户可查看此活动' : '从列表、地图和详情中下架'} · {statusLabels[status]}</Text>
    {event && <History event={event} />}
    <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={save}><Text style={styles.buttonText}>{busy ? '保存中…' : correction ? '保存活动并接受纠错' : event ? '保存活动修改' : '创建活动'}</Text></Pressable>
    {event && !correction && <Pressable accessibilityRole="button" disabled={busy} style={styles.secondaryButton} onPress={changeArchiveState}>
      <Text style={styles.secondaryButtonText}>{event.archived_at ? '恢复活动（保持下架）' : '归档活动'}</Text>
    </Pressable>}
    {!!error && <View onLayout={() => scroll.current?.scrollToEnd({ animated: true })}>
      <Text accessibilityRole="alert" style={styles.error}>{error}</Text>
      {event && <Pressable accessibilityRole="button" disabled={busy} onPress={async () => {
        setBusy(true);
        try { const latest = await getAdminEvent(event.id); setEvent(latest); setDraft(eventDraft(latest)); setStatus(latest.status); setCategory(latest.category); setPublished(latest.is_published); setError(''); setValidate(false); }
        catch { setError('无法重新加载活动。'); } finally { setBusy(false); }
      }}><Text style={styles.link}>重新加载活动（放弃未保存修改）</Text></Pressable>}
    </View>}
  </ScrollView>;
}

/** Lists events or corrections according to `mode`; `onChanged` refreshes public data. */
export function EventAdministrationScreen({ mode, userId, onChanged }: { mode: 'events' | 'corrections'; userId: string; onChanged: () => void }) {
  const [events, setEvents] = useState<AdminEventSummary[]>([]);
  const [corrections, setCorrections] = useState<AdminCorrectionSummary[]>([]);
  const [selected, setSelected] = useState<AdminCorrection | null>(null);
  const [editing, setEditing] = useState<AdminEventDetail | null>(null);
  const [creating, setCreating] = useState(false);
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<AdminCorrection['status']>('pending');
  const [visibility, setVisibility] = useState<'all' | 'published' | 'hidden' | 'archived'>('all');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [total, setTotal] = useState(0);
  useEffect(() => {
    let active = true; setLoading(true); setError(''); setEvents([]); setCorrections([]);
    const timer = setTimeout(() => {
      const request = mode === 'events'
        ? listAdminEvents(offset, query, visibility === 'published' ? true : visibility === 'hidden' ? false : undefined, visibility === 'archived')
          .then((page) => { if (active) { setEvents(page.data); setTotal(page.meta.total); } })
        : listCorrections(status, offset).then((rows) => { if (active) { setCorrections(rows); setTotal(rows.length); } });
      request.catch((err) => { if (active) setError(err.message); }).finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [mode, status, visibility, offset, query, revision]);
  /** Loads full event detail for the selected list `summary`. */
  const openEvent = async (summary: AdminEventSummary) => {
    if (openingId) return;
    setOpeningId(summary.id); setError(''); setNotice('');
    try { setEditing(await getAdminEvent(summary.id)); }
    catch (err) { setError(err instanceof Error ? err.message : '无法加载活动详情。'); }
    finally { setOpeningId(null); }
  };
  /** Loads full correction detail for the selected list `summary`. */
  const openCorrection = async (summary: AdminCorrectionSummary) => {
    if (openingId) return;
    setOpeningId(summary.id); setError(''); setNotice(''); setNote('');
    try { setSelected(await getAdminCorrection(summary.id)); }
    catch (err) { setError(err instanceof Error ? err.message : '无法加载纠错详情。'); }
    finally { setOpeningId(null); }
  };
  /** Leaves the editor, reloads the list, and notifies the app that event data changed. */
  const saved = () => { setEditing(null); setCreating(false); setSelected(null); setOffset(0); setRevision((value) => value + 1); setNotice('已保存，公开活动信息已同步。'); onChanged(); };
  /** Moves the selected correction to `next` after validating its resolution note. */
  const resolve = async (next: 'reviewing' | 'accepted' | 'rejected') => {
    if (!selected) return;
    if (!note.trim()) { setError('请填写处理记录。'); return; }
    setBusy(true); setError('');
    try {
      await reviewCorrection(selected.id, { expected_updated_at: selected.updated_at, status: next, resolution_note: note });
      setSelected(null); setOffset(0); setRevision((value) => value + 1); setNotice('纠错处理结果已保存。');
    } catch (err) { setError(err instanceof Error ? err.message : '处理失败'); }
    finally { setBusy(false); }
  };
  if (editing || creating) return <EventEditor key={editing?.id ?? 'new'} initial={editing ?? undefined} correction={selected ?? undefined} userId={userId} onBack={() => { setEditing(null); setCreating(false); }} onSaved={saved} />;
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>{mode === 'events' ? '活动管理' : '纠错收件箱'}</Text>
    {!!notice && <Text accessibilityLiveRegion="polite">{notice}</Text>}
    {selected ? <>
      <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setSelected(null); setError(''); }}><Text style={styles.link}>← 返回纠错列表</Text></Pressable>
      <Text style={styles.heading}>{selected.kind} · {correctionLabels[selected.status]}</Text>
      <Text selectable style={styles.card}>{selected.message}</Text>
      {!!selected.evidence_url && <Pressable accessibilityRole="link" onPress={() => Linking.openURL(selected.evidence_url!).catch(() => setError('无法打开证据链接。'))}><Text style={styles.link}>查看纠错证据 ↗</Text></Pressable>}
      {!!selected.contact_email && <Text selectable>联系方式：{selected.contact_email}</Text>}
      {['pending', 'reviewing'].includes(selected.status) ? <>
        <RequiredHint />
        <Text style={styles.heading}>处理记录<RequiredMark /></Text>
        <TextInput accessibilityLabel="处理记录" multiline value={note} editable={!busy} onChangeText={setNote} placeholder="核实结论和处理原因" placeholderTextColor={colors.placeholder} style={styles.input} />
        {selected.event_id && <Pressable accessibilityRole="button" disabled={busy} onPress={async () => {
          setBusy(true); setError('');
          try { setEditing(await getAdminEvent(selected.event_id!)); } catch (err) { setError(err instanceof Error ? err.message : '无法加载活动'); }
          finally { setBusy(false); }
        }}><Text style={styles.link}>编辑活动并应用纠错</Text></Pressable>}
        <View style={styles.row}>
          {selected.status === 'pending' && <Pressable accessibilityRole="button" disabled={busy} onPress={() => resolve('reviewing')} style={styles.chip}><Text>开始处理</Text></Pressable>}
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => resolve('accepted')} style={styles.chip}><Text>已核实，无需修改</Text></Pressable>
          <Pressable accessibilityRole="button" disabled={busy} onPress={() => resolve('rejected')} style={styles.chip}><Text>拒绝纠错</Text></Pressable>
        </View>
      </> : <Text>处理记录：{selected.resolution_note}</Text>}
    </> : <>
      {mode === 'events' ? <>
        <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setCreating(true); setNotice(''); }}><Text style={styles.buttonText}>＋ 新建活动</Text></Pressable>
        <TextInput accessibilityLabel="搜索管理活动" placeholder="搜索活动名称" placeholderTextColor={colors.placeholder} value={query} onChangeText={(value) => { setQuery(value); setOffset(0); }} style={styles.input} />
        <View style={styles.row}>{(['all', 'published', 'hidden', 'archived'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: visibility === value }} onPress={() => { setVisibility(value); setOffset(0); }} style={[styles.chip, visibility === value && styles.active]}><Text>{{ all: '全部活动', published: '已公开', hidden: '已下架', archived: '已归档' }[value]}</Text></Pressable>)}</View>
        <Text>共 {total} 条记录</Text>
      </> : <View style={styles.row}>{(Object.keys(correctionLabels) as AdminCorrection['status'][]).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: status === value }} onPress={() => { setStatus(value); setOffset(0); }} style={[styles.chip, status === value && styles.active]}><Text>{correctionLabels[value]}</Text></Pressable>)}</View>}
      <Pressable accessibilityRole="button" onPress={() => setRevision((value) => value + 1)}><Text style={styles.link}>刷新列表</Text></Pressable>
      {loading ? <ActivityIndicator /> : mode === 'events' ? events.map((event) => <Pressable key={event.id} accessibilityRole="button" disabled={openingId !== null} style={styles.card} onPress={() => void openEvent(event)}>
        <Text style={styles.heading}>{event.name}</Text><Text>{event.archived_at ? '已归档' : event.is_published ? '已公开' : '已下架'} · {statusLabels[event.status]}</Text><Text>{new Date(event.starts_at).toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}（北京时间）</Text>{openingId === event.id && <ActivityIndicator />}
      </Pressable>) : corrections.map((correction) => <Pressable key={correction.id} accessibilityRole="button" disabled={openingId !== null} style={styles.card} onPress={() => void openCorrection(correction)}>
        <Text style={styles.heading}>{correction.kind} · {correctionLabels[correction.status]}</Text><Text numberOfLines={3}>{correction.message_preview}</Text><Text>{new Date(correction.created_at).toLocaleString()}</Text>{openingId === correction.id && <ActivityIndicator />}
      </Pressable>)}
      {!loading && !(mode === 'events' ? events : corrections).length && <Text>当前没有记录。</Text>}
      {!loading && <Pager offset={offset} count={(mode === 'events' ? events : corrections).length} onChange={setOffset} />}
    </>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 80, width: '100%', maxWidth: 820, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '900', marginBottom: 16, color: colors.ink },
  heading: { fontSize: 17, fontWeight: '800', color: colors.ink },
  card: { padding: 16, marginVertical: 10, backgroundColor: colors.white, borderRadius: 12, gap: 8 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, marginVertical: 12, backgroundColor: colors.white, color: colors.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginVertical: 12 },
  chip: { padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  active: { backgroundColor: colors.mint },
  link: { color: colors.green, paddingVertical: 12, fontWeight: '700' },
  button: { backgroundColor: colors.orange, borderRadius: 12, padding: 16, marginTop: 12 },
  buttonText: { color: colors.white, fontWeight: '800', textAlign: 'center' },
  secondaryButton: { borderWidth: 1, borderColor: '#A12626', borderRadius: 12, padding: 16, marginTop: 12 },
  secondaryButtonText: { color: '#A12626', fontWeight: '800', textAlign: 'center' },
  warning: { color: '#7A421B', backgroundColor: '#FFF4DF', padding: 12, borderRadius: 10, marginBottom: 12 },
  error: { color: '#A12626', backgroundColor: '#FFF1ED', padding: 12, marginTop: 12 },
});
