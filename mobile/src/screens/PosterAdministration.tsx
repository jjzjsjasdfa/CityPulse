import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { listAdminEvents, request } from '../api/client';
import type { Artist, PosterResult } from '../api/posters';
import type { AdminEventDetail } from '../api/types';
import { EventFields, eventFields, type EventDraft } from '../components/EventFields';
import {EntryAdministration,EntryEditor,type EntryDraft} from './EntryAdministration';
import {EntryReference,EntrySearch,EventSearch} from '../components/Knowledge';
import type {Entry} from '../api/knowledge';
import { colors, categoryLabels } from '../theme';

const inputStyle={borderWidth:1,borderColor:colors.line,borderRadius:8,padding:12,backgroundColor:colors.white,color:colors.ink};
function Button({text,onPress,disabled=false}:{text:string;onPress:()=>void;disabled?:boolean}) {return <Pressable accessibilityRole="button" disabled={disabled} onPress={onPress} style={{padding:12,backgroundColor:colors.mint,borderRadius:8,opacity:disabled?.5:1}}><Text style={{color:colors.ink}}>{text}</Text></Pressable>}
const fields=[['name','姓名 / 艺名'],['birth_date','出生日期（YYYY-MM-DD，可留空）'],['gender','性别'],['hometown','籍贯'],['aliases','外号 / 别名（顿号分隔）'],['fan_name','粉丝称谓'],['support_color','应援色'],['agency','经纪公司'],['honors','荣誉'],['works','代表作（每行：名称 | 语言 | 类别 | 发行时间）'],['references','参考资料（每行：标题 | https://链接）']] as const;
const references=(text:string)=>text.split('\n').filter(line=>line.trim()).map(line=>{const [label,...url]=line.split('|');return {label:label.trim(),url:url.join('|').trim()}});

export function PosterAdministration({onChanged}:{onChanged:()=>void}) {
  const [mode,setMode]=useState<'posters'|'artists'|'entries'>('posters'),[rows,setRows]=useState<PosterResult[]>([]),[artists,setArtists]=useState<Artist[]>([]);
  const [entryDecisions,setEntryDecisions]=useState<{entry_id?:string;new_entry?:EntryDraft;role:string;label:string}[]>([]);
  const [category,setCategory]=useState<keyof typeof categoryLabels>('festival');
  const [createEntry,setCreateEntry]=useState(false);
  const [corrected,setCorrected]=useState({name:'',organizer:'',time:'',place:'',artists:''});
  const [selected,setSelected]=useState<PosterResult|null>(null),[image,setImage]=useState('');
  const [draft,setDraft]=useState<Record<string,string>>({}),[editing,setEditing]=useState<string|null>(null);
  const [eventDraft,setEventDraft]=useState<EventDraft>({} as EventDraft),[newEvent,setNewEvent]=useState(false),[eventId,setEventId]=useState(''),[chosen,setChosen]=useState<string[]>([]);
  const [search,setSearch]=useState(''),[events,setEvents]=useState<AdminEventDetail[]>([]),[note,setNote]=useState(''),[refs,setRefs]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('');
  const load=async()=>{const [a,p]=await Promise.all([request<Artist[]>('/artists'),request<PosterResult[]>('/admin/posters')]);setArtists(a);setRows(p)};
  useEffect(()=>{void load().catch(()=>setError('无法加载审核资料'))},[]);
  const run=async(work:()=>Promise<void>)=>{setBusy(true);setError('');setNotice('');try{await work()}catch(e){setError(e instanceof Error?e.message:'操作失败')}finally{setBusy(false)}};
  const saveArtist=()=>run(async()=>{
    const body={...draft,birth_date:draft.birth_date||null,aliases:(draft.aliases||'').split(/[、,，]/).filter(Boolean),
      works:(draft.works||'').split('\n').filter(Boolean).map(line=>{const [name,language='',category='',released='']=line.split('|').map(v=>v.trim());return{name,language,category,released}}),references:references(draft.references||'')};
    await request(editing?`/admin/artists/${editing}`:'/admin/artists',{method:editing?'PUT':'POST',body:JSON.stringify(body)});setDraft({});setEditing(null);await load();setNotice('歌手资料已保存');
  });
  const review=(approve:boolean)=>run(async()=>{
    const {review_note,...values}=eventDraft;
    const body={approve,note,entries:entryDecisions.map(({label,...d})=>d),corrected:{...corrected,artists:corrected.artists.split(/[、,，]/).map(v=>v.trim()).filter(Boolean)},event_id:approve&&!newEvent?eventId||null:null,new_event:approve&&newEvent?{...values,latitude:Number(values.latitude),longitude:Number(values.longitude),price:values.price||null,category,status:'announced'}:null,artist_ids:chosen,references:references(refs)};
    await request(`/admin/posters/${selected!.id}/review`,{method:'POST',body:JSON.stringify(body)});setSelected(null);await load();onChanged();setNotice(approve?'已审核并整合到活动信息':'已拒绝投稿');
  });
  return <ScrollView contentContainerStyle={{padding:20,paddingBottom:140,gap:14}}><View style={{flexDirection:'row',gap:10}}><Button text="海报投稿" onPress={()=>setMode('posters')}/><Button text="词条库" onPress={()=>setMode('entries')}/></View>
    {!!error&&<Text accessibilityRole="alert" style={{color:colors.red}}>{error}</Text>}{!!notice&&<Text style={{color:colors.green}}>{notice}</Text>}
    {mode==='entries'?<EntryAdministration/>:mode==='artists'?<>
      <Text style={{fontWeight:'700'}}>仅填写已经核实的资料，未知字段留空。年龄由出生日期计算。</Text>
      <View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{artists.map(a=><Button key={a.id} text={a.name} onPress={()=>{setEditing(a.id);setDraft({...Object.fromEntries(fields.map(([key])=>[key,String(a[key as keyof Artist]??'')])),aliases:a.aliases?.join('、')||'',works:a.works?.map(w=>[w.name,w.language,w.category,w.released].join(' | ')).join('\n')||'',references:a.references?.map(r=>`${r.label} | ${r.url}`).join('\n')||''})}}/>)}</View>
      <Button text="新建歌手档案" onPress={()=>{setEditing(null);setDraft({})}}/>
      {fields.map(([key,label])=><View key={key} style={{gap:6}}><Text>{label}</Text><TextInput accessibilityLabel={label} style={inputStyle} value={draft[key]||''} multiline={['works','references','honors'].includes(key)} onChangeText={v=>setDraft(d=>({...d,[key]:v}))}/></View>)}
      <Button disabled={busy} text={editing?'保存档案修改':'创建歌手档案'} onPress={()=>void saveArtist()}/>
    </>:selected?<>
      <Button text="返回投稿列表" onPress={()=>setSelected(null)}/><Text style={{fontSize:22,fontWeight:'700'}}>{selected.extracted.name||'未命名海报'}</Text>
      {!!image&&<Image source={{uri:image}} resizeMode="contain" style={{height:380,width:'100%'}}/>}<Text selectable>{selected.raw_text}</Text>
      <Text>核对原图与外部来源后再通过。合并已有活动会补充阵容和参考链接，不覆盖其原有时间地点。</Text>
      {selected.extracted.cautions?.map((message,i)=><Text key={i} style={{color:colors.green}}>{message}</Text>)}
      {selected.corrections?.map((change,i)=><Text key={i}>{change.value} · {change.source}，请核对原图</Text>)}
      {selected.suggestions?.map((suggestion,i)=><View key={i}><Text>“{suggestion.text}”的候选词条：</Text>{suggestion.candidates.map(c=><EntryReference key={c.id} id={c.id} name={c.name}/>)}</View>)}
      {selected.extracted.scenes?.map((scene,i)=><Button key={i} text={`采用场次：${scene.city} · ${scene.time} · ${scene.place}`} onPress={()=>{setCorrected(d=>({...d,time:scene.time,place:scene.place}));setEventDraft(d=>({...d,city:scene.city,venue_name:scene.place}));setNotice('已填入该场次的模板时间、地点；发布前仍需核实完整时间和地址。')}}/>)}
      <Button text={newEvent?'改为合并已有活动':'创建新活动'} onPress={()=>setNewEvent(!newEvent)}/>
      {newEvent?<><Text>活动类型</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{(Object.keys(categoryLabels) as (keyof typeof categoryLabels)[]).map(k=><Button key={k} text={`${category===k?'✓ ':''}${categoryLabels[k]}`} onPress={()=>setCategory(k)}/>)}</View><EventFields draft={eventDraft} onChange={(key,value)=>setEventDraft(d=>({...d,[key]:value}))}/></>:<>
        <EventSearch initial={search} onChoose={e=>{setEventId(e.id);setNotice(`已选择：${e.name} · ${e.place} · ${e.starts_at}`)}}/>
        {!!eventId&&<Text>已选活动：{eventId}</Text>}</>}
      <Text style={{fontWeight:'700'}}>核实后的模板信息（不会修改原始 OCR 文字）</Text>
      {([['name','活动名称'],['organizer','主办方'],['time','时间'],['place','地点'],['artists','阵容（顿号分隔）']] as const).map(([key,label])=><View key={key}><Text>{label}</Text><TextInput accessibilityLabel={`核实${label}`} style={inputStyle} value={corrected[key]} onChangeText={v=>setCorrected(d=>({...d,[key]:v}))}/></View>)}
      <Text style={{fontWeight:'700'}}>关联词条 / 待入库词条</Text><Text>人物作为阵容、机构作为主办方、地点作为场馆。新词条只在本投稿审核通过时入库。</Text>
      <EntrySearch onChoose={e=>{const role={person:'performer',organization:'organizer',brand:'brand',place:'venue',event:'event'}[e.kind];setEntryDecisions(ds=>ds.some(d=>d.entry_id===e.id)?ds:[...ds,{entry_id:e.id,role,label:e.name}])}}/>
      {entryDecisions.map((d,i)=><Button key={i} text={`${d.new_entry?'待新建':'关联'}：${d.label} · 点击移除`} onPress={()=>setEntryDecisions(ds=>ds.filter((_,j)=>i!==j))}/>)}
      <Button text={createEntry?'收起新建词条':'＋ 随本投稿新建词条'} onPress={()=>setCreateEntry(!createEntry)}/>
      {createEntry&&<EntryEditor onSave={async body=>{setEntryDecisions(ds=>[...ds,{new_entry:body,role:{person:'performer',organization:'organizer',brand:'brand',place:'venue',event:'event'}[body.kind],label:body.name}]);setCreateEntry(false)}}/>}
      <Text>选择已核实的阵容（缺少档案可在上方随投稿新建词条）</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:8}}>{artists.map(a=><Button key={a.id} text={`${chosen.includes(a.id)?'✓ ':''}${a.name}`} onPress={()=>setChosen(ids=>ids.includes(a.id)?ids.filter(id=>id!==a.id):[...ids,a.id])}/>)}</View>
      <TextInput accessibilityLabel="活动参考链接" placeholder="参考链接，每行：标题 | https://链接" multiline value={refs} onChangeText={setRefs} style={inputStyle}/>
      <TextInput accessibilityLabel="投稿审核说明" placeholder="审核说明（必填，会反馈给投稿用户）" multiline value={note} onChangeText={setNote} style={inputStyle}/>
      <Button disabled={busy} text="核实通过并整合" onPress={()=>void review(true)}/><Button disabled={busy} text="拒绝投稿" onPress={()=>void review(false)}/>
    </>:<><Button text="查看更多待审投稿" onPress={()=>void run(async()=>{const next=await request<PosterResult[]>(`/admin/posters?offset=${rows.length}`);setRows([...rows,...next]);if(!next.length)setNotice('已显示全部待审投稿')})}/><Button text="刷新投稿" onPress={()=>void run(load)}/>{!rows.length&&<Text>暂无待审核海报</Text>}{rows.map(row=><Button key={row.id} text={row.extracted.name||'未命名海报'} onPress={()=>void run(async()=>{const [data,detail]=await Promise.all([request<{uri:string}>(`/admin/posters/${row.id}/image`),request<PosterResult>(`/admin/posters/${row.id}`)]);setImage(data.uri);setSelected(detail);setEntryDecisions([]);setCreateEntry(false);setCorrected({name:detail.extracted.name||'',organizer:detail.extracted.organizer||'',time:detail.extracted.time||'',place:detail.extracted.place||'',artists:detail.extracted.artists.join('、')});setNote('');setRefs('');setEventId('');setChosen([]);setNewEvent(false);setCategory('festival');setEvents([]);setSearch(detail.extracted.name||'');setEventDraft(Object.fromEntries(eventFields.map(([key])=>[key,key==='name'?detail.extracted.name||'':key==='organizer'?detail.extracted.organizer||'':''])) as EventDraft)})}/>)}</>}
  </ScrollView>;
}
