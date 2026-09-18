import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import type { EventSummary } from '../api/types';
import { EventCard } from '../components/EventCard';
import { categoryColors, categoryLabels, colors, formatDate } from '../theme';
import type {User} from '../api/types';
import {Avatar,nickname} from '../components/AccountProfile';

interface Props {
  user:User|null; onLogin:()=>void; debug:boolean;
  events: EventSummary[];
  savedIds: Set<string>;
  onSelect: (event: EventSummary) => void;
  onToggleSaved: (id: string) => void;
  onSettings: () => void;
}

export function SavedScreen({ events, savedIds, onSelect, onToggleSaved, onSettings, user, onLogin, debug }: Props) {
  const saved = events.filter((event) => savedIds.has(event.id));
  const viewKey=`@citypulse/favorite-view/${user?.id||'guest'}`;
  const [view,setView]=useState<'cards'|'list'>('cards');
  useEffect(()=>{let active=true;void AsyncStorage.getItem(viewKey).then(value=>{if(active&&(value==='cards'||value==='list'))setView(value)});return()=>{active=false}},[viewKey]);
  const choose=(next:'cards'|'list')=>{setView(next);void AsyncStorage.setItem(viewKey,next)};
  return (
    <FlatList
      key={view}
      data={saved}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.content}
      ListHeaderComponent={
        <View style={styles.header}>
          <View style={{flexDirection:'row',alignItems:'center',justifyContent:'space-between'}}><View style={{flexDirection:'row',alignItems:'center',gap:14}}><Avatar value={user?.avatar}/><View><Text style={{fontSize:24,fontWeight:'800',color:colors.ink}}>{user?nickname(user):'欢迎来逛逛'}</Text>{!user&&<Pressable accessibilityRole="button" onPress={onLogin}><Text style={{color:colors.green,paddingVertical:8}}>登录 / 注册</Text></Pressable>}</View></View>
            <Pressable accessibilityRole="button" accessibilityLabel="设置" onPress={onSettings} style={{padding:12}}><Text style={{fontSize:25,color:colors.ink}}>⚙</Text></Pressable></View>
          <Text style={{fontSize:20,fontWeight:'700',color:colors.ink,marginTop:22}}>我的收藏</Text>
          <Text style={styles.subtitle}>{!user?'登录后可收藏活动，并在不同设备上同步。':debug?'调试收藏 · 与账号的正式收藏分开保存。':`已收藏 ${savedIds.size} 个活动 · 随账号同步`}</Text>
          <View style={styles.switcher}><Pressable accessibilityRole="button" accessibilityLabel="卡片形式" accessibilityState={{selected:view==='cards'}} onPress={()=>choose('cards')} style={[styles.switchButton,view==='cards'&&styles.switchActive]}><Text>▦ 卡片</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="列表形式" accessibilityState={{selected:view==='list'}} onPress={()=>choose('list')} style={[styles.switchButton,view==='list'&&styles.switchActive]}><Text>☷ 列表</Text></Pressable></View>
        </View>
      }
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>♡</Text>
          <Text style={styles.emptyTitle}>还没有收藏</Text>
          <Text style={styles.emptyText}>在信息流或详情页点一下心形，这里就会形成你的城市清单。</Text>
        </View>
      }
      renderItem={({ item }) => view==='cards' ? (
        <EventCard
          event={item}
          saved
          onPress={() => onSelect(item)}
          onToggleSaved={() => onToggleSaved(item.id)}
        />
      ) : <View style={styles.listItem}><Pressable accessibilityRole="button" accessibilityLabel={`查看${item.name}`} onPress={()=>onSelect(item)} style={styles.listMain}><View style={[styles.dot,{backgroundColor:categoryColors[item.category]}]}/><View style={{flex:1}}><Text numberOfLines={1} style={styles.listTitle}>{item.name}</Text><Text numberOfLines={1} style={styles.subtitle}>{categoryLabels[item.category]} · {formatDate(item.starts_at)} · {item.location.venue_name}</Text></View></Pressable><Pressable accessibilityRole="button" accessibilityLabel="取消收藏" onPress={()=>onToggleSaved(item.id)} style={{padding:12}}><Text style={{fontSize:22,color:colors.orange}}>♥</Text></Pressable></View>}
      ListFooterComponent={<View style={{ height: 100 }} />}
    />
  );
}

const styles = StyleSheet.create({
  content: { flexGrow: 1, paddingHorizontal: 20, backgroundColor: colors.paper },
  header: { paddingTop: 24, paddingBottom: 22 },
  eyebrow: { color: colors.orange, fontSize: 11, fontWeight: '900', letterSpacing: 1.8 },
  title: { color: colors.ink, fontSize: 36, fontWeight: '900', marginTop: 7 },
  subtitle: { color: colors.inkMuted, fontSize: 13, marginTop: 7 },
  switcher:{flexDirection:'row',alignSelf:'flex-start',padding:3,borderRadius:10,backgroundColor:colors.white,marginTop:14},
  switchButton:{paddingHorizontal:14,paddingVertical:8,borderRadius:8},switchActive:{backgroundColor:colors.mint},
  listItem:{flexDirection:'row',alignItems:'center',backgroundColor:colors.white,borderBottomWidth:1,borderBottomColor:colors.line,minHeight:72},
  listMain:{flex:1,flexDirection:'row',alignItems:'center',gap:12,paddingVertical:12},dot:{width:12,height:12,borderRadius:6},listTitle:{fontSize:16,fontWeight:'700',color:colors.ink},
  empty: { alignItems: 'center', paddingHorizontal: 35, marginTop: 70 },
  emptyIcon: { color: colors.orange, fontSize: 58 },
  emptyTitle: { color: colors.ink, fontSize: 20, fontWeight: '900', marginTop: 12 },
  emptyText: { color: colors.inkMuted, textAlign: 'center', lineHeight: 21, marginTop: 8 },
});
