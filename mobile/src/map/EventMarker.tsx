import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';

import type { MapEvent } from '../api/types';
import { categoryColors, categoryLabels, colors } from '../theme';
import { getTimeSize, type MapDetail, type MapLevel } from './presentation';
import { ActivityHalo } from './ActivityHalo';

export const markerLabelWidth = (screenWidth: number) => Math.min(144, Math.floor(screenWidth * 0.38));
export const markerHeight = (_level: MapLevel) => 110;

export function EventMarker({ point, level, now, width, saved, detail, labelVisible = true, interactive = false, unread = false, haloUntil = 0 }: {
  point: MapEvent; level: MapLevel; now: number; width: number; saved: boolean; detail?: MapDetail; labelVisible?: boolean; interactive?: boolean; unread?: boolean; haloUntil?: number;
}) {
  const labelOpacity = useRef(new Animated.Value(labelVisible ? 1 : 0)).current;
  useEffect(() => {
    const animation = Animated.timing(labelOpacity, { toValue: labelVisible ? 1 : 0, duration: 180, useNativeDriver: false });
    animation.start(); return () => animation.stop();
  }, [labelVisible, labelOpacity]);
  const { diameter } = getTimeSize(point, now);
  const color = categoryColors[point.category];
  const blend = detail ?? { name: level === 'names' ? 1 : 0, category: level === 'categories' ? 1 : 0, unsaved: 1 };
  const canHit = interactive && (saved || blend.unsaved >= 0.5);
  return (
    <View collapsable={false} pointerEvents="none" style={{ width, height: markerHeight(level), alignItems: 'center', opacity: saved ? 1 : blend.unsaved }}>
      <View style={styles.touchArea}>
        {unread && haloUntil > 0 && <ActivityHalo id={point.id} category={point.category} until={haloUntil} />}
        <View pointerEvents={canHit ? 'auto' : 'none'} testID={`event-dot-${point.id}`} style={[styles.circle, {
          width: diameter, height: diameter, borderRadius: diameter / 2,
          backgroundColor: color, borderColor: unread ? '#101010' : colors.white, borderWidth: unread ? 3 : 2,
          opacity: ['ended', 'cancelled', 'postponed'].includes(point.status) ? 0.65 : 1,
        }]}>{unread && <View pointerEvents="none" testID={`unread-event-${point.id}`} />}</View>
        {saved && <View style={[styles.savedBadge, { backgroundColor: color }]}><Text style={styles.star}>★</Text></View>}
      </View>
      <Animated.View testID={`label-layout-${point.id}`} style={{ position: 'absolute', top: 0, width, height: 110, alignItems: 'center', opacity: labelOpacity }}>
      <View pointerEvents={canHit && labelVisible && blend.category >= 0.5 ? 'auto' : 'none'} testID={`category-label-${point.id}`} style={[styles.label, { maxWidth: 68, opacity: blend.category,
        transform: [{ translateY: (1 - blend.category) * 4 }] }]}>
        <Text numberOfLines={1} maxFontSizeMultiplier={1.15} style={[styles.labelText, { color }]}>{categoryLabels[point.category]}</Text>
      </View>
      <View pointerEvents={canHit && labelVisible && blend.name >= 0.5 ? 'auto' : 'none'} testID={`name-label-${point.id}`} style={[styles.label, { maxWidth: width, opacity: blend.name,
        transform: [{ translateY: (1 - blend.name) * 4 }] }]}>
        <Text testID={`event-label-${point.id}`} numberOfLines={3} maxFontSizeMultiplier={1.15}
          ellipsizeMode="tail" style={[styles.labelText, { color }]}>{point.name}</Text>
      </View>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  touchArea: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  circle: { borderWidth: 2, borderColor: colors.white, elevation: 2, shadowColor: '#173232', shadowOpacity: 0.18, shadowOffset: { width: 0, height: 1 }, shadowRadius: 2 },
  savedBadge: { position: 'absolute', top: 1, right: 1, width: 13, height: 13, borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.white },
  star: { color: colors.white, fontSize: 8, lineHeight: 10 },
  label: { position: 'absolute', top: 44, paddingHorizontal: 5, paddingVertical: 3 },
  labelText: { fontSize: 12, lineHeight: 16, fontWeight: '800', textAlign: 'center' },
});
