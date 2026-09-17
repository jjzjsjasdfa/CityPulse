import {useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {request} from '../api/client';
import {type Entry,type EntryKind,kinds} from '../api/knowledge';
import {EntrySearch,knowledgeInput} from '../components/Knowledge';
import {colors} from '../theme';
export type EntryDraft={kind:EntryKind;name:string;aliases:string[];description:string;references:{label:string;url:string}[];person:Record<string,unknown>;version?:number;note:string};
const personFields=[['birth_date','出生日期（YYYY-MM-DD）'],['gender','性别'],['hometown','籍贯'],['fan_name','粉丝称谓'],['support_color','应援色'],['agency','经纪公司'],['honors','荣誉']] as const;
export function EntryEditor({entry,onSave}:{entry?:Entry|null;onSave:(body:EntryDraft)=>Promise<void>}){
  const [kind,setKind]=useState<EntryKind>(entry?.kind||'person'),[name,setName]=useState(entry?.name||''),[aliases,setAliases]=useState(entry?.aliases?.join('、')||''),[description,setDescription]=useState(entry?.description||'');
  const [person,setPerson]=useState<Record<string,string>>(Object.fromEntries(personFields.map(([key])=>[key,String(entry?.[key]||'')])));
  const [works,setWorks]=useState(entry?.works?.map(w=>[w.name,w.language,w.category,w.released].join(' | ')).join('\n')||''),[refs,setRefs]=useState(entry?.references?.map(r=>`${r.label} | ${r.url}`).join('\n')||''),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[error,setError]=useState('');
  const save=async()=>{setBusy(true);setError('');try{await onSave({kind,name,aliases:aliases.split(/[、,，]/).map(s=>s.trim()).filter(Boolean),description,
    references:refs.split('\n').filter(s=>s.trim()).map(s=>{const [label,...url]=s.split('|');return{label:label.trim(),url:url.join('|').trim()}}),
    person:kind==='person'?{...person,birth_date:person.birth_date||null,works:works.split('\n').filter(s=>s.trim()).map(s=>{const [name,language='',category='',released='']=s.split('|').map(v=>v.trim());return{name,language,category,released}})}:{},version:entry?.version,note});}catch(e){setError(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}};
  const field=(label:string,value:string,set:(s:string)=>void,multiline=false)=><View style={{gap:5}}><Text>{label}</Text><TextInput accessibilityLabel={label} value={value} onChangeText={set} style={knowledgeInput} multiline={multiline}/></View>;
  return <View style={{gap:12}}><Text>仅填写已核实信息；未知内容留空。出生日期用于动态计算年龄。</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:12}}>{(Object.keys(kinds) as EntryKind[]).map(k=><Pressable disabled={!!entry} key={k} onPress={()=>setKind(k)}><Text style={{color:kind===k?colors.green:colors.inkMuted,fontWeight:'700'}}>{kind===k?'✓ ':''}{kinds[k]}</Text></Pressable>)}</View>
    {field('词条名称',name,setName)}{field('别名（顿号分隔）',aliases,setAliases)}{field('词条介绍',description,setDescription,true)}
    {kind==='person'&&<>{personFields.map(([key,label])=><View key={key}>{field(label,person[key]||'',v=>setPerson(p=>({...p,[key]:v})))}</View>)}{field('代表作（每行：名称 | 语言 | 类别 | 发行时间）',works,setWorks,true)}</>}
    {field('词条参考链接（每行：标题 | https://链接）',refs,setRefs,true)}{field('资料核实说明（必填）',note,setNote,true)}{!!error&&<Text accessibilityRole="alert" style={{color:colors.red}}>{error}</Text>}<Pressable disabled={busy} onPress={()=>void save()}><Text style={{color:colors.green,padding:12,fontWeight:'700'}}>{busy?'正在保存…':'确认词条资料'}</Text></Pressable>
  </View>;
}
export function EntryAdministration(){
  const [editing,setEditing]=useState<Entry|null>(null),[key,setKey]=useState(0),[notice,setNotice]=useState(''),[history,setHistory]=useState<{note:string;created_at:string;before:unknown;after:unknown}[]>([]);
  return <View style={{gap:16}}><Text style={{fontSize:22,fontWeight:'700'}}>统一词条库</Text><EntrySearch key={`search/${key}`} onChoose={e=>{setEditing(e);setHistory([]);setNotice('')}}/>
    <Pressable onPress={()=>{setEditing(null);setKey(k=>k+1);setHistory([])}}><Text style={{color:colors.green}}>＋ 新建词条</Text></Pressable>{!!notice&&<Text>{notice}</Text>}
    <EntryEditor key={`${editing?.id||'new'}/${key}`} entry={editing} onSave={async body=>{await request(editing?`/admin/entries/${editing.id}`:'/admin/entries',{method:editing?'PUT':'POST',body:JSON.stringify(body)});setEditing(null);setKey(k=>k+1);setNotice('词条已保存，相关页面可以检索到更新后的内容。')}}/>
    {editing&&<Pressable onPress={()=>void request<typeof history>(`/admin/entries/${editing.id}/revisions`).then(setHistory).catch(()=>setNotice('无法读取修改记录'))}><Text style={{color:colors.green}}>查看最近修改记录</Text></Pressable>}{history.map((r,i)=><View key={i}><Text>{r.created_at} · {r.note}</Text><Text selectable>修改前：{JSON.stringify(r.before)}</Text><Text selectable>修改后：{JSON.stringify(r.after)}</Text></View>)}
  </View>;
}
