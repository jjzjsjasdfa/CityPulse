import {createContext,useContext,useEffect,useRef,useState,type ReactNode} from 'react';
import {Modal,Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {type Entry,type EntryLink,type SearchEvent,kinds,searchEntries,searchEvents} from '../api/knowledge';
import {ArtistInfo,References} from './ArtistInfo';
import {colors} from '../theme';
import {request} from '../api/client';
export const knowledgeInput={borderWidth:1,borderColor:colors.line,borderRadius:8,padding:12,color:colors.ink,backgroundColor:colors.white};
const linkStyle={color:colors.green,paddingVertical:8,fontWeight:'600' as const};
export function EntryReference({id,name}:{id:string;name:string}){
  const open=useContext(OpenKnowledge);
  const [error,setError]=useState(''),[busy,setBusy]=useState(false);
  return <View><Pressable disabled={busy} onPress={()=>{setBusy(true);setError('');void request<Entry>(`/entries/${id}`).then(entry=>open(name,entry)).catch(()=>setError('词条读取失败，请重试')).finally(()=>setBusy(false))}}><Text style={linkStyle}>{busy?'加载中…':`${name} ↗`}</Text></Pressable>{!!error&&<Text accessibilityRole="alert">{error}</Text>}</View>;
}
const OpenKnowledge=createContext<(name:string,entry?:Entry|null)=>void>(()=>undefined);
export function KnowledgeProvider({children}:{children:ReactNode}){
  const [selected,setSelected]=useState<Entry|null>(null),[query,setQuery]=useState<string|null>(null);
  const close=()=>{setSelected(null);setQuery(null)};
  return <OpenKnowledge.Provider value={(name,entry)=>{setSelected(entry||null);setQuery(entry?null:name)}}>{children}
    {selected?<EntryInfo entry={selected} onClose={close}/>:query!==null?<Modal animationType="slide" onRequestClose={close}><ScrollView contentContainerStyle={{padding:24,paddingTop:60,gap:12}}><Pressable onPress={close}><Text style={linkStyle}>关闭 ×</Text></Pressable><Text>未唯一匹配到词条，请核对身份后查看</Text><EntrySearch initial={query} onChoose={e=>{setQuery(null);setSelected(e)}}/></ScrollView></Modal>:null}
  </OpenKnowledge.Provider>;
}
export function EntryInfo({entry,onClose}:{entry:Entry;onClose:()=>void}){
  if(entry.kind==='person')return <ArtistInfo artist={entry} onClose={onClose}/>;
  return <Modal transparent animationType="fade" onRequestClose={onClose}><View style={{flex:1,backgroundColor:'#0007',padding:24,justifyContent:'center'}}><View style={{backgroundColor:colors.paper,padding:24,borderRadius:16,maxHeight:'80%'}}><Pressable onPress={onClose}><Text style={linkStyle}>关闭 ×</Text></Pressable><ScrollView><Text style={{fontSize:24,fontWeight:'700'}}>{entry.name}</Text><Text>{kinds[entry.kind]}</Text><Text style={{lineHeight:24,marginVertical:12}}>{entry.description||'暂无已核实的详细介绍'}</Text><Text>别名：{entry.aliases?.join('、')||'暂无'}</Text><References items={entry.references||[]}/></ScrollView></View></View></Modal>;
}
export function LinkedName({name,links=[]}:{name:string;links?:EntryLink[]}){
  const open=useContext(OpenKnowledge);
  const match=links.find(l=>l.text===name);
  return <Text accessibilityRole="link" style={linkStyle} onPress={()=>open(name,match?.entry)}>{name}{match?.entry?' ↗':' ⌕'}</Text>;
}
export function EntrySearch({initial='',onChoose}:{initial?:string;onChoose:(e:Entry)=>void}){
  const [q,setQ]=useState(initial),[rows,setRows]=useState<Entry[]>([]),[more,setMore]=useState(false),[error,setError]=useState(''),[busy,setBusy]=useState(false);
  const serial=useRef(0);
  const load=async(append=false)=>{const token=++serial.current;setBusy(true);setError('');try{const p=await searchEntries(q,append?rows.length:0);if(token===serial.current){setRows(append?[...rows,...p.items]:p.items);setMore(p.has_more)}}catch{if(token===serial.current)setError('检索失败，请重试')}finally{if(token===serial.current)setBusy(false)}};
  useEffect(()=>{void load();return()=>{serial.current++}},[]);
  return <View style={{gap:8}}><TextInput accessibilityLabel="检索词条" value={q} onChangeText={v=>{setQ(v);setMore(false);serial.current++;setBusy(false)}} style={knowledgeInput} placeholder="名称或别名，支持相似名称"/><Pressable disabled={busy} onPress={()=>void load()}><Text style={linkStyle}>{busy?'正在检索…':'搜索词条'}</Text></Pressable>{!!error&&<Text accessibilityRole="alert">{error}</Text>}{rows.map(e=><Pressable key={e.id} onPress={()=>onChoose(e)}><Text style={linkStyle}>{e.name} · {kinds[e.kind]}{e.hometown?` · ${e.hometown}`:''}</Text></Pressable>)}{!busy&&!rows.length&&<Text>暂无对应词条，未知资料可随海报提交审核。</Text>}{more&&<Pressable disabled={busy} onPress={()=>void load(true)}><Text style={linkStyle}>查看更多词条</Text></Pressable>}</View>;
}
export function EventSearch({initial='',onChoose}:{initial?:string;onChoose:(e:SearchEvent)=>void}){
  const [q,setQ]=useState(initial),[place,setPlace]=useState(''),[rows,setRows]=useState<SearchEvent[]>([]),[more,setMore]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const serial=useRef(0);
  const load=async(append=false)=>{const token=++serial.current;setBusy(true);setError('');try{const p=await searchEvents(q,place,append?rows.length:0);if(token===serial.current){setRows(append?[...rows,...p.items]:p.items);setMore(p.has_more)}}catch{if(token===serial.current)setError('检索失败，请重试')}finally{if(token===serial.current)setBusy(false)}};
  useEffect(()=>()=>{serial.current++},[]);
  const change=(fn:(s:string)=>void)=>(v:string)=>{fn(v);serial.current++;setBusy(false);setMore(false)};
  return <View style={{gap:8}}><TextInput accessibilityLabel="搜索活动名称" value={q} onChangeText={change(setQ)} style={knowledgeInput} placeholder="活动名或场馆"/><TextInput accessibilityLabel="搜索活动城市" value={place} onChangeText={change(setPlace)} style={knowledgeInput} placeholder="城市 / 地点（可选）"/><Pressable disabled={busy} onPress={()=>void load()}><Text style={linkStyle}>{busy?'检索中…':'模糊搜索更多活动'}</Text></Pressable>{!!error&&<Text accessibilityRole="alert">{error}</Text>}{rows.map(e=><Pressable key={e.id} onPress={()=>onChoose(e)}><Text style={linkStyle}>{e.name} · {e.place} · {new Date(e.starts_at).toLocaleDateString()} ›</Text></Pressable>)}{more&&<Pressable disabled={busy} onPress={()=>void load(true)}><Text style={linkStyle}>查看更多活动</Text></Pressable>}</View>;
}
