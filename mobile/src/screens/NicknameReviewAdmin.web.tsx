import { useEffect, useState } from 'react';
import { AdminContext, ResourceContextProvider, ListContextProvider, useList, Datagrid, TextField, FunctionField, SimpleForm, TextInput, SelectInput, required, SaveButton, memoryStore } from 'react-admin';
import { Alert, Box, Button, MenuItem, TextField as MuiTextField, Typography } from '@mui/material';
import { request } from '../api/client';

type Review = {id:string;email:string;current_nickname:string;proposed_nickname:string;status:string;review_note:string};
const statuses=[{id:'pending',name:'待审核'},{id:'approved',name:'已通过'},{id:'rejected',name:'已拒绝'}];
const store=memoryStore();

function Reviews() {
  const [rows,setRows]=useState<Review[]>([]);
  const [status,setStatus]=useState('pending');
  const [query,setQuery]=useState('');
  const [revision,setRevision]=useState(0);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [selected,setSelected]=useState<Review|null>(null);
  const [busy,setBusy]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();setLoading(true);setError('');setRows([]);setSelected(null);
    request<Review[]>(`/admin/nickname-changes?status=${status}`,{signal:controller.signal})
      .then(data=>{if(!controller.signal.aborted)setRows(data)})
      .catch(e=>{if(!controller.signal.aborted)setError(e.message||'审核列表加载失败')})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false)});
    return()=>controller.abort();
  },[status,revision]);
  const filtered=rows.filter(row=>[row.email,row.current_nickname,row.proposed_nickname].some(text=>text?.toLowerCase().includes(query.trim().toLowerCase())));
  const list=useList({data:filtered,isPending:loading,perPage:100,resource:'nickname-changes'});
  const submit=async(values:Record<string,unknown>)=>{
    if(!selected||busy)return;
    const note=String(values.note||'').trim();if(!note){setError('请填写审核说明');return;}
    setBusy(true);setError('');setNotice('');
    try{
      await request(`/admin/nickname-changes/${selected.id}/review`,{method:'POST',body:JSON.stringify({approve:values.decision==='approve',note})});
      setNotice(values.decision==='approve'?'昵称已通过并生效':'昵称申请已拒绝');setSelected(null);setRevision(v=>v+1);
    }catch(e){setError(e instanceof Error?e.message:'提交失败，请重试');}
    finally{setBusy(false)}
  };
  return <Box sx={{p:2,overflow:'auto',height:'100%',boxSizing:'border-box'}}>
    <Typography variant="h5" sx={{mb:2}}>昵称审核</Typography>
    <Box sx={{display:'flex',gap:2,flexWrap:'wrap',mb:2}}>
      <MuiTextField select label="审核状态" value={status} disabled={busy} onChange={e=>{setStatus(e.target.value);setNotice('')}} sx={{minWidth:140}}>{statuses.map(s=><MenuItem key={s.id} value={s.id}>{s.name}</MenuItem>)}</MuiTextField>
      <MuiTextField label="搜索当前列表" value={query} onChange={e=>setQuery(e.target.value)} placeholder="邮箱或昵称"/>
      <Button disabled={busy||loading} onClick={()=>setRevision(v=>v+1)}>刷新</Button>
    </Box>
    {error&&<Alert severity="error">{error}</Alert>}{notice&&<Alert severity="success">{notice}</Alert>}
    <Typography sx={{mb:1}} variant="body2">当前状态最多展示 100 条申请；搜索仅筛选已加载列表。</Typography>
    <ListContextProvider value={list}><Datagrid bulkActionButtons={false} rowClick={false} empty={<Typography>{loading?'正在加载…':'暂无申请'}</Typography>}>
      <TextField source="email" label="账号邮箱"/>
      <TextField source="current_nickname" label="当前昵称" emptyText="未设置昵称"/>
      <TextField source="proposed_nickname" label="申请昵称"/>
      <TextField source="review_note" label="审核说明"/>
      <FunctionField label="操作" render={(row:Review)=>row.status==='pending'?<Button disabled={busy} onClick={()=>{setSelected(row);setError('');setNotice('')}}>审核 {row.proposed_nickname}</Button>:<span>{row.status==='approved'?'已通过':'已拒绝'}</span>}/>
    </Datagrid></ListContextProvider>
    {selected&&<Box sx={{mt:3,border:'1px solid #dce5e1',borderRadius:2,p:2}}>
      <Typography variant="h6">审核：{selected.proposed_nickname}</Typography>
      <SimpleForm key={selected.id} onSubmit={submit} defaultValues={{decision:'approve',note:''}} toolbar={<Box sx={{display:"flex",gap:1,p:2,flexWrap:"wrap"}}> <SaveButton label="提交审核决定" disabled={busy} alwaysEnable/><Button disabled={busy} onClick={()=>setSelected(null)}>取消</Button></Box>}>
        <SelectInput source="decision" label="审核决定" choices={[{id:'approve',name:'通过昵称'},{id:'reject',name:'拒绝昵称'}]} validate={required()} disabled={busy}/>
        <TextInput source="note" label="昵称审核说明" multiline fullWidth validate={required()} disabled={busy}/>
      </SimpleForm>
    </Box>}
  </Box>;
}

export default function NicknameReviewAdmin(){
  // Authentication and role checks remain in CityPulse and its existing API.
  // AdminContext supplies forms/table infrastructure without a second login.
  return <AdminContext store={store}><ResourceContextProvider value="nickname-changes"><Reviews/></ResourceContextProvider></AdminContext>;
}
