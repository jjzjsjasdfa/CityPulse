import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput } from 'react-native';

import { register, signIn } from '../api/client';
import type { LoginResponse } from '../api/types';
import { colors } from '../theme';

export function LoginScreen({ onLogin, onSkip }: { onLogin: (session: LoginResponse) => void; onSkip?:()=>void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const submit = async () => {
    if (busy) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail) {
      setError('请输入邮箱');
      return;
    }
    if (password.length < 12) {
      setError('密码须为 12–128 个字符');
      return;
    }
    setBusy(true); setError('');
    try {
      if (creating) await register(normalizedEmail, password);
      onLogin(await signIn(normalizedEmail, password));
    } catch (err) { setError(err instanceof Error ? err.message : '登录失败，请重试'); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
    <Text style={styles.brand}>CITYPULSE · 长沙</Text>
    <Text style={styles.title}>{creating ? '创建账号' : '欢迎回来'}</Text>
    <Text style={styles.copy}>无需登录也能浏览活动与地图。登录后可同步收藏、识别海报。</Text>
    <Text style={styles.label}>邮箱</Text>
    <TextInput accessibilityLabel="邮箱" autoCapitalize="none" autoComplete="email" keyboardType="email-address" value={email} onChangeText={setEmail} style={styles.input} />
    <Text style={styles.label}>密码（12–128 个字符）</Text>
    <TextInput accessibilityLabel="密码" autoCapitalize="none" autoComplete={creating ? 'new-password' : 'current-password'} secureTextEntry value={password} onChangeText={setPassword} maxLength={128} style={styles.input} onSubmitEditing={() => { void submit(); }} />
    {!!error && <Text accessibilityRole="alert" style={styles.error}>{error}</Text>}
    <Pressable accessibilityRole="button" disabled={busy} onPress={submit}
      style={({ pressed }) => [styles.button, pressed && !busy && styles.pressed, busy && styles.disabled]}>
      {busy ? <ActivityIndicator color="white" /> : <Text style={styles.buttonText}>{creating ? '注册并登录' : '登录'}</Text>}
    </Pressable>
    <Pressable accessibilityRole="button" disabled={busy} onPress={() => { setCreating(!creating); setError(''); }}
      style={({ pressed }) => [styles.linkButton, pressed && !busy && styles.pressed, busy && styles.disabled]}>
      <Text style={styles.link}>{creating ? '已有账号？登录' : '没有账号？注册'}</Text>
    </Pressable>
    {onSkip&&<Pressable accessibilityRole="button" disabled={busy} onPress={onSkip} style={styles.linkButton}><Text style={styles.link}>暂不登录，随便看看</Text></Pressable>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, justifyContent: 'center', padding: 28, width: '100%', maxWidth: 520, alignSelf: 'center' },
  brand: { color: colors.orange, fontWeight: '900', letterSpacing: 2 },
  title: { color: colors.ink, fontSize: 34, fontWeight: '900', marginVertical: 16 },
  copy: { color: colors.inkMuted, lineHeight: 22, marginBottom: 22 },
  label: { color: colors.ink, marginBottom: 8, fontWeight: '700' },
  input: { backgroundColor: colors.white, borderColor: colors.line, borderWidth: 1, borderRadius: 12, padding: 14, marginBottom: 18, color: colors.ink },
  button: { backgroundColor: colors.orange, padding: 16, borderRadius: 12, marginTop: 8, cursor: 'pointer' },
  buttonText: { color: colors.white, fontWeight: '800', textAlign: 'center' },
  linkButton: { padding: 20, cursor: 'pointer' },
  link: { color: colors.green, textAlign: 'center' },
  pressed: { opacity: 0.8 },
  disabled: { cursor: 'auto', opacity: 0.6 },
  error: { color: '#A12626', marginBottom: 12 },
});
