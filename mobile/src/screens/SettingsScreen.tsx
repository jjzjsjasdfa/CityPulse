import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { appNow, type DebugSettings } from '../demo';
import { demoURL } from '../api/client';
import { colors } from '../theme';
import { RadiusSlider } from '../components/RadiusSlider';
import Svg, { Circle } from 'react-native-svg';
import { performanceHistory } from '../map/PerformanceMonitor';

const format = (time: number) => new Date(time + 8 * 3600000).toISOString().slice(0, 16).replace('T', ' ');
export function SettingsScreen({ settings, onApply, onBack }: { settings: DebugSettings; onApply: (settings: DebugSettings, replay?: boolean) => Promise<void>; onBack: () => void }) {
  const [enabled, setEnabled] = useState(settings.enabled);
  const [customTime, setCustomTime] = useState(Boolean(settings.time));
  const [time, setTime] = useState(() => format(appNow()));
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [radiusKm, setRadiusKm] = useState(settings.radiusKm);
  const [monitor, setMonitor] = useState(settings.monitor);
  const [cycleSeconds, setCycleSeconds] = useState(settings.cycleSeconds);
  const apply = async (replay = false) => {
    const parsed = Date.parse(time.trim().replace(' ', 'T') + ':00+08:00');
    if (enabled && customTime && (!/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(time) || !Number.isFinite(parsed) || format(parsed) !== time)) {
      setError('请输入有效的北京时间，例如 2026-09-14 14:30'); return;
    }
    setBusy(true); setError('');
    try { await onApply({ enabled, time: enabled && customTime ? new Date(parsed).toISOString() : null, radiusKm, monitor, cycleSeconds }, replay); }
    catch { setError('设置未保存，请重试'); }
    finally { setBusy(false); }
  };
  return <ScrollView contentContainerStyle={styles.page}>
    <Pressable accessibilityRole="button" accessibilityLabel="返回我的" onPress={onBack}><Text style={styles.body}>‹ 我的</Text></Pressable>
    <Text style={styles.title}>设置</Text>
    <View style={styles.card}>
      <View style={styles.row}><Text style={styles.heading}>调试功能</Text>
        <Switch accessibilityLabel="开启调试功能" value={enabled} onValueChange={setEnabled} /></View>
      <Text style={styles.body}>{enabled ? '使用长沙五一广场的虚拟定位和 200 条虚构活动。' : '使用真实定位与正式活动接口。正式数据尚未接入时显示空地图。'}</Text>
    </View>
    {enabled && <View style={styles.card}>
      <Text style={styles.heading}>新活动提示半径 · {radiusKm} 公里</Text>
      <RadiusSlider value={radiusKm} onChange={setRadiusKm} />
      <View style={styles.row}><Text style={styles.body}>0 · 关闭提示</Text><Text style={styles.body}>30 公里</Text></View>
      <View style={{alignItems:'center'}}><Svg width={160} height={160}>
        <Circle cx={80} cy={80} r={72} fill="none" stroke="#D4E5E1" strokeDasharray="4 5" />
        <Circle testID="radius-preview" cx={80} cy={80} r={radiusKm/30*72} fill="#63CEFF" fillOpacity={0.16} stroke="#38BDB6" />
        <Circle cx={80} cy={80} r={4} fill="#287DE3" /></Svg></View>
      <Text style={styles.body}>以自己的定位为中心，仅此范围内的新活动显示边缘导引和一分钟光圈；范围外活动正常显示，不播放光圈。设为 0 时关闭两种提示。虚线为 30 公里。</Text>
      <Text style={styles.heading}>重叠活动切换间隔 · {cycleSeconds} 秒</Text>
      <View style={styles.row}>
        <Pressable accessibilityRole="button" accessibilityLabel="加快活动切换" style={styles.smallButton} onPress={() => setCycleSeconds(Math.max(0.5, cycleSeconds - 0.5))}><Text>− 0.5 秒</Text></Pressable>
        <Text>{cycleSeconds} 秒</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="减慢活动切换" style={styles.smallButton} onPress={() => setCycleSeconds(Math.min(5, cycleSeconds + 0.5))}><Text>+ 0.5 秒</Text></Pressable>
      </View>
      <Text style={styles.body}>仅显示全名时，对同址或非常接近且圆点重叠的活动原位轮播；最快每 0.5 秒切换，最慢 5 秒。缩小后自然堆叠。</Text>
      <View style={styles.row}><Text style={styles.heading}>流畅度监测</Text><Switch accessibilityLabel="流畅度监测" value={monitor} onValueChange={setMonitor} /></View>
      <Text style={styles.body}>显示帧率、帧间隔和卡顿统计，记录最近 3 分钟；连续不流畅会提示需要优化。仅调试模式采集。</Text>
      {performanceHistory.length > 0 && <Text style={styles.body}>已记录 {performanceHistory.length} 秒 · 最近 {performanceHistory.at(-1)?.fps} FPS · 持续卡顿记录 {performanceHistory.filter(row=>row.needsOptimization).length} 条</Text>}
    </View>}
    {enabled && <View style={styles.card}>
      <View style={styles.row}><Text style={styles.heading}>自选当前时间</Text>
        <Switch accessibilityLabel="自选当前时间" value={customTime} onValueChange={setCustomTime} /></View>
      <Text style={styles.body}>北京时间（UTC+8）。应用后时间继续流逝，活动大小和新活动判断同步变化。</Text>
      {customTime && <>
        <TextInput accessibilityLabel="调试当前时间" value={time} onChangeText={setTime} placeholder="YYYY-MM-DD HH:mm" style={styles.input} />
        <View style={styles.row}>{[-1, 1, 7].map((days) => <Pressable key={days} accessibilityRole="button" style={styles.smallButton}
          onPress={() => { const parsed = Date.parse(time.replace(' ', 'T') + ':00+08:00'); setTime(format((Number.isFinite(parsed) ? parsed : appNow()) + days * 86400000)); }}>
          <Text>{days > 0 ? '+' : ''}{days} 天</Text></Pressable>)}</View>
      </>}
      {settings.enabled && <Pressable accessibilityRole="button" style={styles.smallButton} onPress={async () => {
        try { const response = await fetch(demoURL('/demo')); if (!response.ok) throw new Error(); const data = await response.json(); setCustomTime(true); setTime(format(Date.parse(data.anchor) + 60000)); }
        catch { setError('测试服务未连接，暂时无法读取数据起始时间'); }
      }}><Text>使用数据起始时间</Text></Pressable>}
      <Text style={styles.body}>“重播新活动”会重置调试模式的已读状态，并在所选时间模拟周围 8 个方向的新活动。</Text>
      <Pressable accessibilityRole="button" disabled={busy} style={styles.smallButton} onPress={() => { void apply(true); }}><Text>应用并重播新活动</Text></Pressable>
    </View>}
    {error ? <Text accessibilityRole="alert" style={styles.error}>{error}</Text> : null}
    <Pressable accessibilityRole="button" disabled={busy} style={styles.apply} onPress={() => { void apply(); }}><Text style={styles.applyText}>{busy ? '应用中…' : '应用设置并返回地图'}</Text></Pressable>
  </ScrollView>;
}
const styles = StyleSheet.create({
  page: { padding: 22, gap: 18, backgroundColor: colors.paper, flexGrow: 1 }, title: { fontSize: 28, fontWeight: '800', color: colors.ink },
  card: { padding: 18, borderRadius: 18, backgroundColor: colors.white, gap: 14 }, row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  heading: { fontSize: 16, fontWeight: '700', color: colors.ink }, body: { fontSize: 13, lineHeight: 21, color: colors.inkMuted },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 10, padding: 13, fontSize: 16, color: colors.ink },
  smallButton: { padding: 12, borderRadius: 10, backgroundColor: colors.paper }, apply: { padding: 17, borderRadius: 14, backgroundColor: colors.ink },
  applyText: { color: colors.white, fontWeight: '700', textAlign: 'center' }, error: { color: '#A42626' },
});
