import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CandidateReviewScreen } from './CandidateReviewScreen';
import { EventAdministrationScreen } from './EventAdministrationScreen';
import { UserAdministrationScreen } from './UserAdministrationScreen';
import { colors } from '../theme';

type AdminSection = 'candidates' | 'corrections' | 'events' | 'users';
const sectionLabels: Record<AdminSection, string> = {
  candidates: '候选审核', corrections: '纠错收件箱', events: '活动', users: '用户与权限',
};

/** Selects an admin section; `userId` scopes drafts and `onChanged` refreshes public data. */
export function AdminWorkspace({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [section, setSection] = useState<AdminSection>('candidates');
  /** Renders a navigation group named `title` containing the supplied section `values`. */
  const navigation = (title: string, values: AdminSection[]) => <View style={{ gap: 8 }}>
    <Text style={{ color: colors.inkMuted, fontWeight: '700' }}>{title}</Text>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
      {values.map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: section === value }} onPress={() => setSection(value)}
        style={{ padding: 10, borderRadius: 8, backgroundColor: section === value ? colors.mint : colors.white }}>
        <Text>{sectionLabels[value]}</Text>
      </Pressable>)}
    </View>
  </View>;
  return <View style={{ flex: 1 }}>
    <View style={{ gap: 12, padding: 12 }}>
      {navigation('审核中心', ['candidates', 'corrections'])}
      {navigation('内容与访问', ['events', 'users'])}
    </View>
    {section === 'candidates' && <CandidateReviewScreen userId={userId} onPublished={onChanged} />}
    {section === 'corrections' && <EventAdministrationScreen mode="corrections" userId={userId} onChanged={onChanged} />}
    {section === 'events' && <EventAdministrationScreen mode="events" userId={userId} onChanged={onChanged} />}
    {section === 'users' && <UserAdministrationScreen currentUserId={userId} />}
  </View>;
}
