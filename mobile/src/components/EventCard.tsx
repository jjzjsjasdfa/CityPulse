import { Pressable, StyleSheet, Text, View } from 'react-native';

import type { EventSummary } from '../api/types';
import { categoryColors, categoryLabels, colors, formatDate, statusLabels } from '../theme';

interface Props {
  event: EventSummary;
  saved: boolean;
  onPress: () => void;
  onToggleSaved: () => void;
}

export function EventCard({ event, saved, onPress, onToggleSaved }: Props) {
  const accent = categoryColors[event.category];

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`查看${event.name}`}
        onPress={onPress}
        style={({ pressed }) => [styles.cardMain, pressed && styles.pressed]}
      >
        <View style={[styles.art, { backgroundColor: accent }]}>
          <View style={styles.artCircle} />
          <Text style={styles.artCategory}>{categoryLabels[event.category]}</Text>
          <Text numberOfLines={3} style={styles.artTitle}>
            {event.name}
          </Text>
          <Text style={styles.artDistrict}>{event.location.district}</Text>
        </View>
        <View style={styles.body}>
          <View style={styles.badgeRow}>
            {event.is_new && <Text style={styles.newBadge}>刚上新</Text>}
            {event.is_ending_soon && <Text style={styles.endingBadge}>快结束</Text>}
            {event.is_demo && <Text style={styles.demoBadge}>演示</Text>}
          </View>
          <Text style={styles.date}>{formatDate(event.starts_at)}</Text>
          <Text numberOfLines={2} style={styles.summary}>
            {event.summary}
          </Text>
          <Text numberOfLines={1} style={styles.location}>
            {event.location.venue_name}
          </Text>
        </View>
      </Pressable>
      <View style={styles.footer}>
        <View style={styles.verifiedRow}>
          <Text style={styles.verifiedDot}>●</Text>
          <Text style={styles.verifiedText}>
            {statusLabels[event.status]} · {Math.round(event.confidence * 100)}% 可信度
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={saved ? '取消收藏' : '收藏活动'}
          hitSlop={10}
          onPress={onToggleSaved}
          style={styles.saveButton}
        >
          <Text style={[styles.saveIcon, saved && styles.saveIconActive]}>{saved ? '♥' : '♡'}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: 'hidden',
    marginBottom: 16,
  },
  cardMain: { backgroundColor: colors.white },
  pressed: { opacity: 0.88, transform: [{ scale: 0.99 }] },
  art: { minHeight: 158, padding: 20, overflow: 'hidden', justifyContent: 'space-between' },
  artCircle: {
    position: 'absolute',
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 34,
    borderColor: 'rgba(255,255,255,0.18)',
    right: -45,
    top: -55,
  },
  artCategory: { color: colors.white, fontSize: 13, fontWeight: '800', letterSpacing: 2 },
  artTitle: { color: colors.white, fontSize: 27, lineHeight: 33, fontWeight: '900', maxWidth: '82%' },
  artDistrict: { color: 'rgba(255,255,255,0.88)', fontSize: 13, fontWeight: '700' },
  body: { padding: 18 },
  badgeRow: { flexDirection: 'row', gap: 7, minHeight: 22 },
  newBadge: {
    alignSelf: 'flex-start',
    color: colors.white,
    backgroundColor: colors.orange,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontWeight: '800',
    fontSize: 11,
  },
  endingBadge: {
    alignSelf: 'flex-start',
    color: colors.ink,
    backgroundColor: colors.yellow,
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontWeight: '800',
    fontSize: 11,
  },
  demoBadge: {
    alignSelf: 'flex-start',
    color: colors.inkMuted,
    backgroundColor: '#E9E5DB',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontWeight: '700',
    fontSize: 11,
  },
  date: { color: colors.ink, fontWeight: '900', fontSize: 18, marginTop: 8 },
  summary: { color: colors.inkMuted, fontSize: 14, lineHeight: 21, marginTop: 8 },
  location: { color: colors.ink, fontSize: 13, fontWeight: '700', marginTop: 13 },
  footer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 18,
    paddingBottom: 13,
    backgroundColor: colors.white,
  },
  saveButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  saveIcon: { color: colors.ink, fontSize: 28 },
  saveIconActive: { color: colors.orange },
  verifiedRow: { flex: 1, flexDirection: 'row', alignItems: 'center' },
  verifiedDot: { color: colors.green, fontSize: 9, marginRight: 6 },
  verifiedText: { color: colors.green, fontSize: 12, fontWeight: '700' },
});
