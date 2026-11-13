import { useEffect, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { type Artist, eventBackground, type Reference } from '../api/posters';
import { colors } from '../theme';
import {EntryInfo,LinkedName} from './Knowledge';
import type {Entry} from '../api/knowledge';

export function References({ items }: { items: Reference[] }) {
  return <View style={{gap:12}}>{items.map((ref,i) => <Pressable key={`${ref.url}/${i}`} accessibilityRole="link" onPress={() => { if (/^https?:\/\//i.test(ref.url)) void Linking.openURL(ref.url).catch(() => undefined); }}><Text style={{color:colors.green}}>{ref.label} ↗</Text></Pressable>)}</View>;
}
export function ArtistInfo({artist,onClose}:{artist:Artist;onClose:()=>void}) {
  const birth=artist.birth_date?new Date(artist.birth_date):null, now=new Date();
  const age=birth?now.getFullYear()-birth.getFullYear()-(now.getMonth()<birth.getMonth()||(now.getMonth()===birth.getMonth()&&now.getDate()<birth.getDate())?1:0):null;
  return <Modal transparent animationType="fade" onRequestClose={onClose}><View style={s.overlay}><View style={s.sheet}>
    <Pressable accessibilityRole="button" onPress={onClose}><Text style={s.close}>关闭 ×</Text></Pressable><ScrollView><Text style={s.title}>{artist.name}</Text>
    {([['年龄',age===null?'':`${age} 岁`],['性别',artist.gender],['籍贯',artist.hometown],['外号 / 别名',artist.aliases?.join('、')],['粉丝称谓',artist.fan_name],['应援色',artist.support_color],['经纪公司',artist.agency],['荣誉',artist.honors]] as const).map(([label,value])=><Text key={label} style={s.line}>{label}：{value||'暂无已核实资料'}</Text>)}
    {!!artist.description&&<Text style={s.line}>{artist.description}</Text>}<Text style={s.heading}>代表作</Text>{artist.works?.length?artist.works.map((work,i)=><Text key={i} style={s.line}>{work.name} · {[work.language,work.category,work.released].filter(Boolean).join(' / ')}</Text>):<Text style={s.line}>暂无已核实资料</Text>}
    <Text style={s.heading}>参考资料</Text><References items={artist.references??[]}/></ScrollView></View></View></Modal>;
}
export function ArtistNames({artists}:{artists:Artist[]}) {
  const [selected,setSelected]=useState<Artist|null>(null);
  return <><View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{artists.map(artist=><Pressable key={artist.id} accessibilityRole="button" onPress={()=>setSelected(artist)} style={s.chip}><Text style={{color:colors.green,fontWeight:'700'}}>{artist.name} ↗</Text></Pressable>)}</View>{selected&&<ArtistInfo artist={selected} onClose={()=>setSelected(null)}/>}</>;
}
export function EventArtistBackground({id}:{id:string}) {
  const [data,setData]=useState<Awaited<ReturnType<typeof eventBackground>>|null>(null);
  const [selected,setSelected]=useState<Entry|null>(null);
  useEffect(()=>{let active=true;setData(null);eventBackground(id).then(value=>{if(active)setData(value)}).catch(()=>undefined);return()=>{active=false}},[id]);
  if(!data)return null;
  return <View style={{gap:14,marginVertical:20}}><Text style={s.heading}>活动背景</Text>
    {data.facts&&(['name','organizer','place'] as const).map(key=><Text key={key} style={s.line}>{{name:'活动',organizer:'主办方',place:'场馆'}[key]}：{data.facts[key]?<LinkedName name={data.facts[key]!} links={data.links}/>: '暂无已核实资料'}</Text>)}
    <ArtistNames artists={data.artists}/>{data.entries?.map(({entry,role})=><Pressable key={`${entry.id}/${role}`} onPress={()=>setSelected(entry)}><Text style={{color:colors.green}}>{entry.name} ↗</Text></Pressable>)}
    <Text style={s.heading}>参考资料</Text><References items={data.references}/>{selected&&<EntryInfo entry={selected} onClose={()=>setSelected(null)}/>}</View>;
}
const s=StyleSheet.create({overlay:{flex:1,backgroundColor:'#0007',justifyContent:'center',padding:24},sheet:{backgroundColor:colors.paper,borderRadius:20,padding:24,maxHeight:'85%',width:'100%',maxWidth:540,alignSelf:'center'},close:{textAlign:'right',color:colors.green,paddingBottom:16},title:{fontSize:28,fontWeight:'800',color:colors.ink,marginBottom:14},heading:{fontSize:17,fontWeight:'700',color:colors.ink,marginVertical:12},line:{fontSize:14,lineHeight:24,color:colors.inkMuted,marginBottom:6},chip:{backgroundColor:'#E3EEE8',padding:10,borderRadius:8}});
