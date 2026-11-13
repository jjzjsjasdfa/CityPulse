import {useEffect,useState} from 'react';
import {Pressable,ScrollView,Text,TextInput,View} from 'react-native';
import {request} from '../api/client';
import {colors} from '../theme';

interface Change {id:string;user_id:string;email:string;current_nickname:string;proposed_nickname:string;created_at:string}
export function NicknameReviewScreen(){
 const [rows,setRows]=useState<Change[]>([]),[selected,setSelected]=useState<Change|null>(null),[note,setNote]=useState(''),[busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const load=async()=>setRows(await request<Change[]>('/admin/nickname-changes'));
 useEffect(()=>{void load().catch(()=>setMessage('无法加载昵称申请'))},[]);
 const review=async(approve:boolean)=>{if(!selected||!note.trim())return;setBusy(true);setMessage('');try{await request(`/admin/nickname-changes/${selected.id}/review`,{method:'POST',body:JSON.stringify({approve,note:note.trim()})});setSelected(null);setNote('');await load();setMessage(approve?'昵称已通过并生效':'昵称申请已拒绝')}catch(e){setMessage(e instanceof Error?e.message:'审核失败')}finally{setBusy(false)}};
 return <ScrollView contentContainerStyle={{padding:20,paddingBottom:140,gap:14}}><Text style={{fontSize:22,fontWeight:'800'}}>昵称审核</Text><Text style={{color:colors.inkMuted}}>用户昵称会展示在“我的”等公开界面。核对是否含冒充、联系方式或不适宜内容。</Text>{!!message&&<Text accessibilityRole="alert">{message}</Text>}
 {!rows.length&&<Text>暂无待审核昵称</Text>}{rows.map(row=><Pressable accessibilityRole="button" key={row.id} onPress={()=>{setSelected(row);setNote('')}} style={{padding:14,borderRadius:12,backgroundColor:colors.white,gap:6}}><Text style={{fontWeight:'700'}}>{row.current_nickname||'未设置昵称'} → {row.proposed_nickname}</Text><Text style={{color:colors.inkMuted}}>{row.email} · {new Date(row.created_at).toLocaleString()}</Text></Pressable>)}
 {selected&&<View style={{padding:16,borderRadius:14,backgroundColor:colors.white,gap:12}}><Text style={{fontWeight:'700'}}>审核：{selected.proposed_nickname}</Text><TextInput accessibilityLabel="昵称审核说明" value={note} onChangeText={setNote} multiline placeholder="填写通过依据或拒绝原因" style={{borderWidth:1,borderColor:colors.line,borderRadius:8,padding:12}}/><View style={{flexDirection:'row',gap:18}}><Pressable accessibilityRole="button" disabled={busy||!note.trim()} onPress={()=>void review(true)}><Text style={{color:colors.green}}>通过昵称</Text></Pressable><Pressable accessibilityRole="button" disabled={busy||!note.trim()} onPress={()=>void review(false)}><Text style={{color:colors.red}}>拒绝昵称</Text></Pressable></View></View>}
 </ScrollView>
}
