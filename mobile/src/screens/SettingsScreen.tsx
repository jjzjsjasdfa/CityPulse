import { Pressable, ScrollView, Text } from 'react-native';
import type { User } from '../api/types';
import { AccountProfile } from '../components/AccountProfile';
import { colors } from '../theme';

export function SettingsScreen({ user, onUserChange, onLogout, onLogin, onBack }: {
  user: User | null; onUserChange: (user: User) => void; onLogout: () => Promise<void>;
  onLogin: () => void; onBack: () => void;
}) {
  return <ScrollView contentContainerStyle={{ padding: 22, gap: 18, backgroundColor: colors.paper, flexGrow: 1, width: '100%', maxWidth: 840, alignSelf: 'center' }}>
    <Pressable accessibilityRole="button" accessibilityLabel="返回我的" onPress={onBack}><Text>‹ 我的</Text></Pressable>
    <Text style={{ fontSize: 28, fontWeight: '800', color: colors.ink }}>设置</Text>
    <AccountProfile user={user} onUserChange={onUserChange} onLogout={onLogout} onLogin={onLogin} />
  </ScrollView>;
}
