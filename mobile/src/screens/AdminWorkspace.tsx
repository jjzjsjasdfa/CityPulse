import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CandidateReviewScreen } from './CandidateReviewScreen';
import { EventAdministrationScreen } from './EventAdministrationScreen';
import { colors } from '../theme';

export function AdminWorkspace({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [section, setSection] = useState<'candidates' | 'events' | 'corrections'>('candidates');
  return <View style={{ flex: 1 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
      {(['candidates', 'events', 'corrections'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: section === value }} onPress={() => setSection(value)}
        style={{ padding: 10, borderRadius: 8, backgroundColor: section === value ? colors.mint : colors.white }}>
        <Text>{{ candidates: '候选审核', events: '活动管理', corrections: '纠错收件箱' }[value]}</Text>
      </Pressable>)}
    </View>
    {section === 'candidates' ? <CandidateReviewScreen userId={userId} onPublished={onChanged} /> : <EventAdministrationScreen key={section} mode={section} userId={userId} onChanged={onChanged} />}
  </View>;
}
