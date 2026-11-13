import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { adminUserRevisions, createAdminUser, getAdminUser, listAdminUsers, revokeAdminUserSessions, updateAdminUser } from '../api/client';
import type { AdminUserDetail, AdminUserRevision, AdminUserSummary, UserRole } from '../api/types';
import { colors } from '../theme';
import { RequiredHint, RequiredMark } from '../components/RequiredField';

const roleLabels: Record<UserRole, string> = { regular: '普通用户', admin: '管理员' };

/** Loads and displays audit-history rows for `user`. */
function UserHistory({ user }: { user: AdminUserDetail }) {
  const [rows, setRows] = useState<AdminUserRevision[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    adminUserRevisions(user.id).then((value) => { if (active) setRows(value); })
      .catch(() => { if (active) setError('无法加载账户操作记录。'); });
    return () => { active = false; };
  }, [user.id, user.updated_at]);
  return <View style={styles.card}>
    <Text style={styles.heading}>操作记录</Text>
    {!!error && <Text style={styles.error}>{error}</Text>}
    {!rows.length && !error && <Text>暂无操作记录。</Text>}
    {rows.map((row) => <View key={row.id} style={styles.historyRow}>
      <Text>{new Date(row.created_at).toLocaleString()} · {row.action}</Text>
      <Text>{row.note}</Text>
    </View>)}
  </View>;
}

/** Creates or edits `initial`; `currentUserId` protects the signed-in admin from lockout. */
function UserEditor({ initial, currentUserId, onBack, onSaved }: {
  initial?: AdminUserDetail; currentUserId: string; onBack: () => void; onSaved: (message: string) => void;
}) {
  const creating = !initial;
  const isSelf = initial?.id === currentUserId;
  const [email, setEmail] = useState(initial?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<UserRole>(initial?.role ?? 'regular');
  const [active, setActive] = useState(initial?.is_active ?? true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  /** Validates and creates the account, or saves role and active-state changes. */
  const save = async () => {
    if (!email.trim() || (creating && password.length < 12)) {
      setError(creating ? '请填写邮箱和至少 12 位的临时密码。' : '请填写邮箱。'); return;
    }
    if (!creating && !note.trim()) { setError('请填写角色或状态变更原因。'); return; }
    setBusy(true); setError('');
    try {
      if (creating) await createAdminUser({ email: email.trim(), password, role });
      else await updateAdminUser(initial.id, {
        expected_updated_at: initial.updated_at, role, is_active: active, note,
      });
      onSaved(creating ? '账户已创建。请通过安全渠道发送临时密码。' : '账户权限和状态已更新。');
    } catch (err) { setError(err instanceof Error ? err.message : '账户保存失败。'); }
    finally { setBusy(false); }
  };
  /** Revokes all active sessions for the user being edited. */
  const revoke = async () => {
    if (!initial) return;
    setBusy(true); setError('');
    try { await revokeAdminUserSessions(initial.id); onSaved('该账户的所有登录会话已撤销。'); }
    catch (err) { setError(err instanceof Error ? err.message : '无法撤销登录会话。'); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Pressable accessibilityRole="button" disabled={busy} onPress={onBack}><Text style={styles.link}>← 返回用户列表</Text></Pressable>
    <Text style={styles.title}>{creating ? '创建账户' : '用户详情'}</Text>
    <RequiredHint />
    <Text style={styles.label}>邮箱{creating && <RequiredMark />}</Text>
    <TextInput accessibilityLabel="用户邮箱" autoCapitalize="none" keyboardType="email-address" editable={creating && !busy} value={email} onChangeText={setEmail} style={styles.input} />
    {creating && <>
      <Text style={styles.label}>临时密码<RequiredMark /></Text>
      <TextInput accessibilityLabel="临时密码" autoCapitalize="none" secureTextEntry editable={!busy} value={password} onChangeText={setPassword} style={styles.input} />
      <Text>至少 12 位。系统目前不会发送邮件，请通过安全渠道交付。</Text>
    </>}
    <Text style={styles.label}>角色<RequiredMark /></Text>
    <View style={styles.row}>{(['regular', 'admin'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: role === value }} disabled={busy || Boolean(isSelf && value !== 'admin')} onPress={() => setRole(value)} style={[styles.chip, role === value && styles.active]}><Text>{roleLabels[value]}</Text></Pressable>)}</View>
    {!creating && <>
      <Text style={styles.label}>账户状态<RequiredMark /></Text>
      <View style={styles.row}>{[true, false].map((value) => <Pressable key={String(value)} accessibilityRole="button" accessibilityState={{ selected: active === value }} disabled={busy || Boolean(isSelf && !value)} onPress={() => setActive(value)} style={[styles.chip, active === value && styles.active]}><Text>{value ? '启用' : '停用'}</Text></Pressable>)}</View>
      {isSelf && <Text style={styles.warning}>不能停用自己的账户或移除自己的管理员角色。</Text>}
      <Text style={styles.label}>变更原因<RequiredMark /></Text>
      <TextInput accessibilityLabel="账户变更原因" multiline editable={!busy} value={note} onChangeText={setNote} placeholder="记录权限或状态变更原因" placeholderTextColor={colors.placeholder} style={styles.input} />
      <UserHistory user={initial} />
    </>}
    <Pressable accessibilityRole="button" disabled={busy} style={styles.button} onPress={save}><Text style={styles.buttonText}>{busy ? '保存中…' : creating ? '创建账户' : '保存账户变更'}</Text></Pressable>
    {!creating && <Pressable accessibilityRole="button" disabled={busy} style={styles.secondaryButton} onPress={revoke}><Text style={styles.secondaryButtonText}>撤销所有登录会话</Text></Pressable>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </ScrollView>;
}

/** Lists and filters accounts; `currentUserId` identifies the protected current admin. */
export function UserAdministrationScreen({ currentUserId }: { currentUserId: string }) {
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  const [role, setRole] = useState<'all' | UserRole>('all');
  const [accountStatus, setAccountStatus] = useState<'all' | 'active' | 'disabled'>('all');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  useEffect(() => {
    let active = true; setLoading(true); setError('');
    const timer = setTimeout(() => {
      listAdminUsers(offset, query, role === 'all' ? undefined : role,
        accountStatus === 'all' ? undefined : accountStatus === 'active')
        .then((page) => { if (active) { setUsers(page.data); setTotal(page.meta.total); setHasNext(page.meta.has_next); } })
        .catch((err) => { if (active) setError(err.message); })
        .finally(() => { if (active) setLoading(false); });
    }, 200);
    return () => { active = false; clearTimeout(timer); };
  }, [offset, query, role, accountStatus, revision]);
  /** Returns to the list, reloads it, and displays the supplied success `message`. */
  const saved = (message: string) => {
    setSelected(null); setCreating(false); setOffset(0); setNotice(message); setRevision((value) => value + 1);
  };
  /** Loads full user detail for the selected list `summary`. */
  const openUser = async (summary: AdminUserSummary) => {
    if (openingId) return;
    setOpeningId(summary.id); setError(''); setNotice('');
    try { setSelected(await getAdminUser(summary.id)); }
    catch (err) { setError(err instanceof Error ? err.message : '无法加载用户详情。'); }
    finally { setOpeningId(null); }
  };
  if (selected || creating) return <UserEditor key={selected?.id ?? 'new'} initial={selected ?? undefined} currentUserId={currentUserId} onBack={() => { setSelected(null); setCreating(false); }} onSaved={saved} />;
  return <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
    <Text style={styles.title}>用户与权限</Text>
    {!!notice && <Text accessibilityLiveRegion="polite" style={styles.notice}>{notice}</Text>}
    <Pressable accessibilityRole="button" style={styles.button} onPress={() => { setCreating(true); setNotice(''); }}><Text style={styles.buttonText}>＋ 创建账户</Text></Pressable>
    <TextInput accessibilityLabel="搜索用户" placeholder="搜索邮箱" placeholderTextColor={colors.placeholder} autoCapitalize="none" value={query} onChangeText={(value) => { setQuery(value); setOffset(0); }} style={styles.input} />
    <Text style={styles.label}>角色</Text>
    <View style={styles.row}>{(['all', 'regular', 'admin'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: role === value }} onPress={() => { setRole(value); setOffset(0); }} style={[styles.chip, role === value && styles.active]}><Text>{{ all: '全部', regular: '普通用户', admin: '管理员' }[value]}</Text></Pressable>)}</View>
    <Text style={styles.label}>状态</Text>
    <View style={styles.row}>{(['all', 'active', 'disabled'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: accountStatus === value }} onPress={() => { setAccountStatus(value); setOffset(0); }} style={[styles.chip, accountStatus === value && styles.active]}><Text>{{ all: '全部', active: '启用', disabled: '停用' }[value]}</Text></Pressable>)}</View>
    <Text>共 {total} 个账户</Text>
    <Pressable accessibilityRole="button" onPress={() => setRevision((value) => value + 1)}><Text style={styles.link}>刷新列表</Text></Pressable>
    {loading ? <ActivityIndicator /> : users.map((user) => <Pressable key={user.id} accessibilityRole="button" disabled={openingId !== null} style={styles.card} onPress={() => void openUser(user)}>
      <Text style={styles.heading}>{user.email}{user.id === currentUserId ? '（当前账户）' : ''}</Text>
      <Text>{roleLabels[user.role]} · {user.is_active ? '启用' : '停用'}</Text>
      <Text>创建于 {new Date(user.created_at).toLocaleString()}</Text>
      {openingId === user.id && <ActivityIndicator />}
    </Pressable>)}
    {!loading && !users.length && <Text>当前没有账户。</Text>}
    {!loading && <View style={styles.row}>
      <Pressable accessibilityRole="button" disabled={offset === 0} onPress={() => setOffset(Math.max(0, offset - 20))}><Text style={styles.link}>上一页</Text></Pressable>
      <Text>第 {offset / 20 + 1} 页</Text>
      <Pressable accessibilityRole="button" disabled={!hasNext} onPress={() => setOffset(offset + 20)}><Text style={styles.link}>下一页</Text></Pressable>
    </View>}
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  content: { padding: 20, paddingBottom: 80, width: '100%', maxWidth: 820, alignSelf: 'center' },
  title: { fontSize: 28, fontWeight: '900', marginBottom: 16, color: colors.ink },
  heading: { fontSize: 17, fontWeight: '800', color: colors.ink },
  label: { color: colors.ink, fontWeight: '800', marginTop: 12 },
  card: { padding: 16, marginVertical: 10, backgroundColor: colors.white, borderRadius: 12, gap: 8 },
  historyRow: { borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 10, gap: 4 },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 12, marginVertical: 10, backgroundColor: colors.white, color: colors.ink },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center', marginVertical: 10 },
  chip: { padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 10 },
  active: { backgroundColor: colors.mint },
  link: { color: colors.green, paddingVertical: 12, fontWeight: '700' },
  button: { backgroundColor: colors.orange, borderRadius: 12, padding: 16, marginTop: 12 },
  buttonText: { color: colors.white, fontWeight: '800', textAlign: 'center' },
  secondaryButton: { borderWidth: 1, borderColor: colors.green, borderRadius: 12, padding: 16, marginTop: 12 },
  secondaryButtonText: { color: colors.green, fontWeight: '800', textAlign: 'center' },
  warning: { color: '#7A421B', backgroundColor: '#FFF4DF', padding: 12, borderRadius: 10 },
  notice: { color: colors.green, backgroundColor: colors.mint, padding: 12, borderRadius: 10 },
  error: { color: '#A12626', backgroundColor: '#FFF1ED', padding: 12, marginTop: 12 },
});
