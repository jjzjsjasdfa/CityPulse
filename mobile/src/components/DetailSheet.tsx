import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import type { EventDetail } from '../api/types';
import { eventLink } from '../eventLinks';
import { categoryColors, categoryLabels, colors, formatDate, statusLabels } from '../theme';

interface Props {
  event: EventDetail | null;
  loading: boolean;
  saved: boolean;
  onClose: () => void;
  onToggleSaved: () => void;
  onSubmitCorrection: (message: string) => Promise<void>;
}

export function DetailSheet({ event, loading, saved, onClose, onToggleSaved, onSubmitCorrection }: Props) {
  const [showCorrection, setShowCorrection] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [shareError, setShareError] = useState(false);

  if (!event) return null;
  const accent = categoryColors[event.category];
  const shareUrl = eventLink(event.id);

  const openMap = async () => {
    const { latitude, longitude } = event.location;
    try {
      await Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${latitude},${longitude}`)}`);
    } catch {
      Alert.alert('无法打开地图', '请稍后重试，或将地址复制到地图软件中搜索。');
    }
  };

  const shareEvent = async () => {
    setShareError(false);
    const text = `${event.name}${event.is_demo ? '（演示活动）' : ''}\n${formatDate(event.starts_at)}\n${event.location.venue_name}\n在城迹 CityPulse 打开活动：\n${shareUrl}`;
    try {
      if (Platform.OS === 'web') {
        if (navigator.share) await navigator.share({ title: event.name, text });
        else setShareError(true);
      } else {
        await Share.share({ title: event.name, message: text });
      }
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setShareError(true);
    }
  };

  const submit = async () => {
    if (message.trim().length < 10) {
      Alert.alert('请再具体一点', '至少填写 10 个字，帮助审核人员快速定位问题。');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmitCorrection(message.trim());
      setMessage('');
      setShowCorrection(false);
      Alert.alert('已收到', '纠错已进入审核队列，感谢你帮助保持信息准确。');
    } catch {
      Alert.alert('暂未提交', '服务当前不可用，请稍后再试。');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet" visible>
      <View style={styles.container}>
        <View style={styles.topBar}>
          <Pressable accessibilityRole="button" accessibilityLabel="关闭活动详情" hitSlop={10} onPress={onClose}>
            <Text style={styles.close}>×</Text>
          </Pressable>
          <Text style={styles.topTitle}>活动详情</Text>
          <Pressable accessibilityRole="button" hitSlop={10} onPress={onToggleSaved}>
            <Text style={[styles.heart, saved && styles.heartSaved]}>{saved ? '♥' : '♡'}</Text>
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={[styles.hero, { backgroundColor: accent }]}>
            <View style={styles.heroRing} />
            <Text style={styles.heroCategory}>{categoryLabels[event.category]}</Text>
            <Text style={styles.heroTitle}>{event.name}</Text>
            <Text style={styles.heroCity}>{event.location.city} · {event.location.district}</Text>
          </View>
          {loading && <ActivityIndicator color={colors.orange} style={styles.loading} />}
          {event.is_demo && (
            <View style={styles.demoNotice}>
              <Text style={styles.demoNoticeText}>演示数据，不代表真实举办信息</Text>
            </View>
          )}
          <View style={styles.primaryInfo}>
            <Text style={styles.label}>时间</Text>
            <Text style={styles.value}>{formatDate(event.starts_at)}</Text>
            {event.price && (
              <>
                <Text style={styles.label}>价格</Text>
                <Text style={styles.value}>{event.price}</Text>
              </>
            )}
            <Text style={styles.label}>地点</Text>
            <Text style={styles.value}>{event.location.venue_name}</Text>
            <Pressable accessibilityRole="link" accessibilityLabel={`${event.location.address}，在 Google 地图中打开`} onPress={openMap} style={styles.addressButton}>
              <Text style={[styles.subValue, styles.addressLink]}>{event.location.address} ↗</Text>
            </Pressable>
          </View>
          <View style={styles.statusCard}>
            <View style={styles.statusTop}>
              <Text style={styles.status}>{statusLabels[event.status]}</Text>
              <Text style={styles.confidence}>{Math.round(event.confidence * 100)}% 可信度</Text>
            </View>
            <Text style={styles.verified}>最近核验：{formatDate(event.last_verified_at)}</Text>
          </View>
          <Text style={styles.sectionTitle}>活动说明</Text>
          <Text style={styles.description}>{event.description}</Text>
          <View style={styles.tags}>
            {event.attributes.map((attribute) => (
              <Text key={attribute} style={styles.tag}>{attribute}</Text>
            ))}
          </View>
          <Text style={styles.sectionTitle}>来源证据</Text>
          {event.sources.map((source) => (
            <Pressable
              key={source.id}
              onPress={() => Linking.openURL(source.evidence_url)}
              style={styles.sourceRow}
            >
              <View style={styles.sourceCheck}><Text style={styles.sourceCheckText}>✓</Text></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.sourceName}>{source.name}</Text>
                <Text style={styles.sourceMeta}>
                  {source.is_official ? '官方来源' : '可信补充'} · {formatDate(source.checked_at)}
                </Text>
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          ))}
          <Text style={styles.sectionTitle}>状态记录</Text>
          {event.status_history.map((history, index) => (
            <View key={history.id} style={styles.timelineRow}>
              <View style={styles.timelineRail}>
                <View style={styles.timelineDot} />
                {index < event.status_history.length - 1 && <View style={styles.timelineLine} />}
              </View>
              <View style={{ flex: 1, paddingBottom: 17 }}>
                <Text style={styles.timelineTitle}>{statusLabels[history.status]}</Text>
                <Text style={styles.timelineText}>{history.note}</Text>
                <Text style={styles.timelineDate}>{formatDate(history.changed_at)}</Text>
              </View>
            </View>
          ))}
          {showCorrection ? (
            <View style={styles.correctionBox}>
              <Text style={styles.correctionTitle}>哪里需要纠正？</Text>
              <TextInput
                multiline
                onChangeText={setMessage}
                placeholder="例如：活动已延期，官方页面显示新日期为……"
                placeholderTextColor="#8A9996"
                style={styles.input}
                value={message}
              />
              <View style={styles.correctionActions}>
                <Pressable onPress={() => setShowCorrection(false)} style={styles.secondaryButton}>
                  <Text style={styles.secondaryButtonText}>取消</Text>
                </Pressable>
                <Pressable disabled={submitting} onPress={submit} style={styles.primaryButton}>
                  <Text style={styles.primaryButtonText}>{submitting ? '提交中…' : '提交审核'}</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setShowCorrection(true)} style={styles.correctionLink}>
              <Text style={styles.correctionLinkText}>发现信息有误？提交纠错</Text>
            </Pressable>
          )}
          <View style={styles.actions}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="分享活动"
              onPress={shareEvent}
              style={styles.shareButton}
            >
              <Text style={styles.shareText}>分享活动</Text>
            </Pressable>
            <Pressable disabled={!event.official_url} onPress={() => Linking.openURL(event.official_url)} style={styles.officialButton}>
              <Text style={styles.officialText}>{event.official_url ? '前往官方页面 ↗' : '测试活动 · 无官方页面'}</Text>
            </Pressable>
          </View>
          {shareError && (
            <View style={styles.correctionBox}>
              <Text style={styles.subValue}>可复制以下链接，发给已安装 CityPulse 的朋友：</Text>
              <Text selectable style={styles.addressLink}>{shareUrl}</Text>
            </View>
          )}
          <Text style={styles.disclaimer}>报名、购票及变更信息请以主办方官方页面为准。</Text>
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.paper },
  topBar: {
    height: 58,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.paper,
  },
  close: { color: colors.ink, fontSize: 32, lineHeight: 32 },
  topTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  heart: { color: colors.ink, fontSize: 28 },
  heartSaved: { color: colors.orange },
  scroll: { paddingBottom: 40 },
  hero: { minHeight: 250, padding: 24, justifyContent: 'flex-end', overflow: 'hidden' },
  heroRing: {
    position: 'absolute', width: 260, height: 260, borderRadius: 130, borderWidth: 48,
    borderColor: 'rgba(255,255,255,0.17)', right: -75, top: -80,
  },
  heroCategory: { color: colors.white, fontSize: 12, fontWeight: '900', letterSpacing: 2 },
  heroTitle: { color: colors.white, fontSize: 35, lineHeight: 42, fontWeight: '900', marginTop: 10, maxWidth: '88%' },
  heroCity: { color: 'rgba(255,255,255,0.86)', fontWeight: '700', marginTop: 12 },
  loading: { marginTop: 10 },
  demoNotice: { margin: 20, marginBottom: 0, backgroundColor: '#FFF0C8', borderRadius: 12, padding: 11 },
  demoNoticeText: { color: '#705B20', textAlign: 'center', fontSize: 12, fontWeight: '800' },
  primaryInfo: { padding: 20, paddingBottom: 12 },
  label: { color: colors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 1.4, marginTop: 10 },
  value: { color: colors.ink, fontSize: 20, lineHeight: 27, fontWeight: '900', marginTop: 5 },
  subValue: { color: colors.inkMuted, fontSize: 13, marginTop: 4 },
  addressButton: { minHeight: 44, justifyContent: 'center', alignSelf: 'flex-start' },
  addressLink: { color: colors.green, textDecorationLine: 'underline', lineHeight: 22 },
  statusCard: { marginHorizontal: 20, backgroundColor: colors.ink, borderRadius: 18, padding: 16 },
  statusTop: { flexDirection: 'row', justifyContent: 'space-between' },
  status: { color: colors.white, fontWeight: '900', fontSize: 16 },
  confidence: { color: colors.mint, fontWeight: '800', fontSize: 13 },
  verified: { color: '#BBCAC6', fontSize: 12, marginTop: 7 },
  sectionTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginHorizontal: 20, marginTop: 26, marginBottom: 10 },
  description: { color: colors.inkMuted, fontSize: 15, lineHeight: 24, marginHorizontal: 20 },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginHorizontal: 20, marginTop: 14 },
  tag: { color: colors.ink, backgroundColor: '#EAE6DC', paddingHorizontal: 11, paddingVertical: 6, borderRadius: 999, fontSize: 12, fontWeight: '700' },
  sourceRow: { marginHorizontal: 20, flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderRadius: 16, padding: 14, borderWidth: 1, borderColor: colors.line, marginBottom: 9 },
  sourceCheck: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.green, alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  sourceCheckText: { color: colors.white, fontWeight: '900' },
  sourceName: { color: colors.ink, fontWeight: '900', fontSize: 14 },
  sourceMeta: { color: colors.inkMuted, fontSize: 11, marginTop: 4 },
  chevron: { color: colors.inkMuted, fontSize: 26 },
  timelineRow: { flexDirection: 'row', marginHorizontal: 20 },
  timelineRail: { width: 24, alignItems: 'center' },
  timelineDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.orange, marginTop: 4 },
  timelineLine: { width: 2, flex: 1, backgroundColor: colors.line, marginVertical: 3 },
  timelineTitle: { color: colors.ink, fontSize: 14, fontWeight: '900' },
  timelineText: { color: colors.inkMuted, fontSize: 13, marginTop: 3 },
  timelineDate: { color: '#82918F', fontSize: 11, marginTop: 4 },
  correctionLink: { marginHorizontal: 20, marginTop: 18, borderWidth: 1, borderColor: colors.line, borderRadius: 15, padding: 14 },
  correctionLinkText: { color: colors.ink, fontWeight: '800', textAlign: 'center' },
  correctionBox: { marginHorizontal: 20, marginTop: 20, backgroundColor: colors.white, borderRadius: 18, padding: 16, borderWidth: 1, borderColor: colors.line },
  correctionTitle: { color: colors.ink, fontSize: 16, fontWeight: '900' },
  input: { minHeight: 105, color: colors.ink, backgroundColor: colors.paper, borderRadius: 12, padding: 12, marginTop: 10, textAlignVertical: 'top' },
  correctionActions: { flexDirection: 'row', gap: 9, marginTop: 12 },
  secondaryButton: { flex: 1, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: colors.line },
  secondaryButtonText: { color: colors.ink, textAlign: 'center', fontWeight: '800' },
  primaryButton: { flex: 2, padding: 12, borderRadius: 12, backgroundColor: colors.orange },
  primaryButtonText: { color: colors.white, textAlign: 'center', fontWeight: '900' },
  actions: { flexDirection: 'row', gap: 10, marginHorizontal: 20, marginTop: 26 },
  shareButton: { flex: 1, padding: 15, borderRadius: 14, borderWidth: 1, borderColor: colors.ink },
  shareText: { color: colors.ink, textAlign: 'center', fontWeight: '900' },
  officialButton: { flex: 2, padding: 15, borderRadius: 14, backgroundColor: colors.orange },
  officialText: { color: colors.white, textAlign: 'center', fontWeight: '900' },
  disclaimer: { color: colors.inkMuted, fontSize: 11, textAlign: 'center', margin: 16 },
});
