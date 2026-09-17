import {useEffect,useState} from 'react';
import {Pressable,Text,TextInput,View} from 'react-native';
import {request} from '../api/client';
import type {User} from '../api/types';
import {colors} from '../theme';

const avatars:Record<string,string>={person:'☺',leaf:'🌿',music:'♫',sun:'☀',cat:'🐱',planet:'🪐'};
export const nickname=(user:User)=>user.nickname||`城市访客 ${user.id.slice(0,6)}`;
export function Avatar({value='person'}:{value?:string}){return <View accessibilityLabel="用户头像" style={{width:64,height:64,borderRadius:32,backgroundColor:colors.mint,alignItems:'center',justifyContent:'center'}}><Text style={{fontSize:32,color:colors.green}}>{avatars[value]||avatars.person}</Text></View>}

export function AccountProfile({user,onUserChange,onLogout,onLogin}:{user:User|null;onUserChange:(user:User)=>void;onLogout:()=>Promise<void>;onLogin:()=>void}){
 const [name,setName]=useState(user?nickname(user):''),[avatar,setAvatar]=useState(user?.avatar||'person'),[notice,setNotice]=useState(''),[busy,setBusy]=useState(false);
 const [providers,setProviders]=useState<{id:string;name:string;available:boolean;bound:boolean}[]>([]);
 useEffect(()=>{let active=true;if(user)void request<{providers:typeof providers}>('/auth/bindings').then(r=>{if(active)setProviders(r.providers)}).catch(()=>{if(active)setNotice('账号绑定状态暂时无法加载')});return()=>{active=false}},[user?.id]);
 const save=async()=>{setBusy(true);setNotice('');try{const updated=await request<User>('/auth/me',{method:'PUT',body:JSON.stringify({nickname:name,avatar})});onUserChange(updated);setNotice('账号资料已保存')}catch(e){setNotice(e instanceof Error?e.message:'保存失败')}finally{setBusy(false)}};
 return <View style={{padding:18,borderRadius:18,backgroundColor:'white',gap:14}}><Text style={{fontSize:18,fontWeight:'700'}}>账号与安全</Text>{user?<>
  <Text>邮箱：{user.email}</Text><Text>身份：{user.role==='admin'?'管理员':'普通用户'}</Text><Text selectable>账号 ID：{user.id}</Text><Text>注册日期：{new Date(user.created_at).toLocaleDateString()}</Text>
  <Text>昵称</Text><TextInput accessibilityLabel="用户昵称" maxLength={40} value={name} onChangeText={setName} style={{borderWidth:1,borderColor:colors.line,padding:12,borderRadius:8}}/>
  <Text>选择头像</Text><View style={{flexDirection:'row',flexWrap:'wrap',gap:10}}>{Object.entries(avatars).map(([key,value])=><Pressable key={key} accessibilityRole="button" accessibilityLabel={`头像 ${key}`} accessibilityState={{selected:avatar===key}} onPress={()=>setAvatar(key)} style={{padding:10,borderRadius:12,backgroundColor:avatar===key?colors.mint:colors.paper}}><Text style={{fontSize:26}}>{value}</Text></Pressable>)}</View>
  <Pressable accessibilityRole="button" disabled={busy||!name.trim()} onPress={()=>void save()}><Text style={{color:colors.green}}>保存账号资料</Text></Pressable>
  <Text style={{fontWeight:'700'}}>账号绑定与快捷登录</Text>{providers.map(p=><View key={p.id}><Text>{p.name} · {p.available?(p.bound?'已绑定':'未绑定'):'暂未开放'}</Text></View>)}<Text style={{color:colors.inkMuted}}>微信等平台接入后，可在此绑定并使用快捷登录。</Text>
  <Pressable accessibilityRole="button" disabled={busy} onPress={()=>{setBusy(true);void onLogout().catch(()=>{setNotice('退出失败，请重试');setBusy(false)})}}><Text style={{color:colors.red}}>退出登录</Text></Pressable>
 </>:<><Text>当前为游客，可自由浏览地图和活动。</Text><Pressable accessibilityRole="button" onPress={onLogin}><Text style={{color:colors.green}}>前往我的登录</Text></Pressable></>}{!!notice&&<Text accessibilityRole="alert">{notice}</Text>}</View>
}
