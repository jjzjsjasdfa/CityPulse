import { useEffect, useRef, useState } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { ActivityIndicator, Image, Platform, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { getPoster, posterHistory, uploadPoster, type PosterResult } from '../api/posters';
import { ArtistNames } from './ArtistInfo';
import { colors } from '../theme';
import { DEMO_MODE } from '../demo';
const statuses:Record<string,string>={pending:'待审核',approved:'已通过',rejected:'未通过'};
export function PosterDiscovery({onSave,onOpen}:{onSave:(id:string)=>Promise<void>;onOpen:(id:string)=>void}) {
  const [result,setResult]=useState<PosterResult|null>(null),[history,setHistory]=useState<PosterResult[]>([]);
  const [busy,setBusy]=useState(false),[notice,setNotice]=useState(''),[error,setError]=useState(''),[preview,setPreview]=useState(''),[showRaw,setShowRaw]=useState(false);
  const mounted=useRef(true);
  useEffect(()=>{mounted.current=true;if(!DEMO_MODE)void posterHistory().then(setHistory).catch(()=>undefined);return()=>{mounted.current=false}},[]);
  const show=async(value:PosterResult)=>{
    if(!mounted.current)return;setResult(value);
    if(value.auto_save_id){try{await onSave(value.auto_save_id);setNotice('已找到对应活动，并加入你的收藏。')}catch{setError('已识别，但收藏失败，请点击匹配活动重试。')}}
    else setNotice(value.matches.length?'发现相似活动，请确认场次后收藏。':'暂未匹配到已发布活动，资料已进入后台审核。');
  };
  const upload=async()=>{
    setError('');setNotice('');
    try{const choice=await ImagePicker.launchImageLibraryAsync({mediaTypes:['images'],base64:true,quality:1});if(choice.canceled)return;
      const asset=choice.assets[0];if(!asset.base64||(asset.fileSize??asset.base64.length*.75)>8*1024*1024)throw new Error('请选择不超过 8 MB 的 JPG、PNG 或 WebP 海报。');
      setBusy(true);setResult(null);setPreview(asset.uri);await show(await uploadPoster(asset.base64));if(mounted.current)setHistory(await posterHistory());
    }catch(e){if(mounted.current)setError(e instanceof Error?e.message:'识别失败，请重试。')}finally{if(mounted.current)setBusy(false)}
  };
  const share=async()=>{
    if(!result)return;const f=result.extracted;
    const text=`${f.name||'活动海报'}\n阵容：${f.artists.join('、')||'未识别'}\n时间：${f.time||'未识别'}\n地点：${f.place||'未识别'}\n主办方：${f.organizer||'未识别'}\n来自 CityPulse 海报识别，信息待核实。`;
    try{if(Platform.OS==='web'){if(navigator.share)await navigator.share({title:f.name||'活动海报',text});else{await navigator.clipboard.writeText(text);setNotice('活动介绍已复制，可以粘贴分享给朋友。')}}else await Share.share({message:text});}catch(e){if(!(e instanceof Error&&e.name==='AbortError'))setError('分享未完成，你也可以长按复制识别结果。')}
  };
  return <View style={s.card}><Text style={s.eyebrow}>从一张海报，认识一场活动</Text><Text style={s.title}>这场音乐节，值得去吗？</Text>
    <Text style={s.copy}>上传官宣海报，了解阵容、查看歌手资料，找到地图上的活动。</Text>
    <Pressable accessibilityRole="button" disabled={busy||DEMO_MODE} onPress={()=>void upload()} style={s.button}><Text style={s.buttonText}>{busy?'正在识别海报…':'＋ 上传活动海报'}</Text></Pressable>
    <Text style={s.hint}>{DEMO_MODE?'请关闭调试模式并登录后使用。':'支持 JPG / PNG / WebP，最大 8 MB。上传后保存至你的识别记录，并提交管理员核实。'}</Text>
    {!!preview&&<Image source={{uri:preview}} style={{height:150,width:'100%',marginTop:12}} resizeMode="contain"/>}{busy&&<ActivityIndicator color={colors.orange} style={{margin:12}}/>}
    {!!error&&<Text accessibilityRole="alert" style={s.error}>{error}</Text>}{!!notice&&<Text style={s.notice}>{notice}</Text>}
    {result&&<View style={{gap:12,marginTop:16}}><Text style={s.heading}>{result.extracted.name||'活动名称未识别'}</Text><Text style={s.hint}>海报识别结果 · {statuses[result.status]}，请以主办方最新公告为准</Text>
      {(['organizer','time','place'] as const).map(key=><Text selectable key={key} style={s.copy}>{{organizer:'主办方',time:'时间',place:'地点'}[key]}：{result.extracted[key]||'未识别'}</Text>)}
      <Text selectable style={s.copy}>海报阵容：{result.extracted.artists.join('、')||'未识别，请查看原文或等待审核补充'}</Text><ArtistNames artists={result.artists}/>
      {!result.artists.length&&<Text style={s.hint}>歌手资料库暂未匹配到已核实档案。</Text>}{result.review_note&&<Text style={s.copy}>审核反馈：{result.review_note}</Text>}
      {result.matches.map(item=><View key={item.id} style={s.match}><Pressable onPress={()=>onOpen(item.id)}><Text style={s.heading}>{item.name} ›</Text><Text style={s.hint}>{item.place} · {new Date(item.starts_at).toLocaleDateString()}</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>void onSave(item.id).then(()=>setNotice('已加入收藏')).catch(()=>setError('收藏失败，请重试'))}><Text style={s.link}>收藏此场活动</Text></Pressable></View>)}
      <View style={s.row}><Pressable accessibilityRole="button" onPress={()=>setShowRaw(!showRaw)}><Text style={s.link}>{showRaw?'收起':'查看'}识别原文</Text></Pressable><Pressable accessibilityRole="button" onPress={()=>void share()}><Text style={s.link}>分享活动介绍 ↗</Text></Pressable></View>{showRaw&&<Text selectable style={s.copy}>{result.raw_text}</Text>}
    </View>}
    {!!history.length&&<View style={{marginTop:20,gap:10}}><Text style={s.heading}>最近识别</Text>{history.slice(0,5).map(row=><Pressable key={row.id} disabled={busy} onPress={()=>{setBusy(true);setError('');setPreview('');void getPoster(row.id).then(show).catch(()=>setError('无法读取识别记录')).finally(()=>setBusy(false))}}><Text style={s.link}>{row.extracted.name||'未命名海报'} · {statuses[row.status]} ›</Text></Pressable>)}</View>}
  </View>;
}
const s=StyleSheet.create({card:{margin:20,padding:22,borderRadius:18,backgroundColor:'#FFFDF8',borderWidth:1,borderColor:colors.line},eyebrow:{fontSize:12,color:colors.green,fontWeight:'700',marginBottom:10},title:{fontSize:23,fontWeight:'800',color:colors.ink},copy:{fontSize:14,lineHeight:23,color:colors.inkMuted},button:{backgroundColor:colors.ink,padding:15,borderRadius:10,marginTop:18,alignItems:'center'},buttonText:{color:'white',fontWeight:'700',fontSize:15},hint:{fontSize:12,lineHeight:19,color:colors.inkMuted,marginTop:7},error:{color:colors.red,marginTop:12},notice:{color:colors.green,marginTop:12,lineHeight:22},heading:{fontWeight:'700',fontSize:16,color:colors.ink},link:{color:colors.green,fontWeight:'600',paddingVertical:6},row:{flexDirection:'row',flexWrap:'wrap',gap:20},match:{padding:12,backgroundColor:'#F0F4ED',borderRadius:10,gap:6}});
