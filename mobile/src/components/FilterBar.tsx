import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import type { EventCategory } from '../api/types';
import { categoryLabels, colors } from '../theme';

export type FilterValue = 'all' | 'newest' | 'ending_soon' | 'past' | EventCategory;

const options: Array<{ value: FilterValue; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'past', label: '往期活动' },
  { value: 'newest', label: '刚上新' },
  { value: 'ending_soon', label: '快结束' },
  { value: 'performance', label: categoryLabels.performance },
  { value: 'exhibition', label: categoryLabels.exhibition },
  { value: 'market', label: categoryLabels.market },
  { value: 'sports', label: categoryLabels.sports },
  { value: 'festival', label: categoryLabels.festival },
];

interface Props {
  value: FilterValue;
  onChange: (value: FilterValue) => void;
}

export function FilterBar({ value, onChange }: Props) {
  return (
    <ScrollView
      horizontal
      contentContainerStyle={styles.content}
      showsHorizontalScrollIndicator={false}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ selected }}
            key={option.value}
            onPress={() => onChange(option.value)}
            style={[styles.chip, selected && styles.chipSelected]}
          >
            <Text style={[styles.label, selected && styles.labelSelected]}>{option.label}</Text>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  chip: {
    borderRadius: 999,
    paddingHorizontal: 15,
    paddingVertical: 9,
    backgroundColor: colors.white,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipSelected: { backgroundColor: colors.ink, borderColor: colors.ink },
  label: { color: colors.ink, fontSize: 13, fontWeight: '700' },
  labelSelected: { color: colors.white },
});
