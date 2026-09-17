import { useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { CandidateReviewScreen } from './CandidateReviewScreen';
import { EventAdministrationScreen } from './EventAdministrationScreen';
import { colors } from '../theme';
import { PosterAdministration } from './PosterAdministration';

export function AdminWorkspace({ userId, onChanged }: { userId: string; onChanged: () => void }) {
  const [section, setSection] = useState<'candidates' | 'events' | 'corrections' | 'posters'>('candidates');
  return <View style={{ flex: 1 }}>
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 12 }}>
      {(['candidates', 'events', 'corrections', 'posters'] as const).map((value) => <Pressable key={value} accessibilityRole="button" accessibilityState={{ selected: section === value }} onPress={() => setSection(value)}
        style={{ padding: 10, borderRadius: 8, backgroundColor: section === value ? colors.mint : colors.white }}>
        <Text>{{ candidates: '候选审核', events: '活动管理', corrections: '纠错收件箱', posters: '海报与词条' }[value]}</Text>
      </Pressable>)}
    </View>
    {section === 'posters' ? <PosterAdministration onChanged={onChanged}/> : section === 'candidates' ? <CandidateReviewScreen userId={userId} onPublished={onChanged} /> : <EventAdministrationScreen key={section} mode={section} userId={userId} onChanged={onChanged} />}
  </View>;
}
