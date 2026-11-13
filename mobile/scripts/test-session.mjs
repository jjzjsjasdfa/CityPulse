import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const source=ts.transpileModule(readFileSync(new URL('../src/api/client.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
function setup(initial=null){
 let stored=initial;let account='';const calls=[];const replies=[];
 const api={};const context={exports:api,__DEV__:false,process:{env:{}},URL,Date,AbortSignal,
  require(name){
   if(name==='@react-native-async-storage/async-storage')return {__esModule:true,default:{getItem:async()=>account,setItem:async(k,v)=>{account=v}}};
   if(name==='./sessionStorage')return {readSession:async()=>stored,writeSession:async v=>{stored=v}};
   if(name==='react-native')return {Platform:{OS:'web'}};
   if(name==='expo-constants')return {default:{}};
   if(name==='../demo')return {DEMO_MODE:false};
   return {};
  },
  fetch:async(url,init)=>{calls.push({url,init});const next=replies.shift();if(next instanceof Error)throw next;return {ok:next.status<400,status:next.status,json:async()=>next.body};}
 };
 vm.runInNewContext(source,context);
 return {api,calls,replies,get stored(){return stored}};
}
const session={access_token:'test-token',expires_at:new Date(Date.now()+180*86400000).toISOString(),token_type:'bearer',user:{id:'user',role:'regular',email:'test@example.com'}};
const saved=JSON.stringify({...session,origin:'http://localhost:8000/api/v1'});
test('login persists token without password or cached permissions; fresh client restores verified role',async()=>{
 const a=setup();a.replies.push({status:200,body:session});await a.api.signIn('test@example.com','secret');
 assert.ok(a.stored);assert.ok(!a.stored.includes('secret'));assert.ok(!a.stored.includes('role'));
 const b=setup(a.stored);b.replies.push({status:200,body:{...session,user:{...session.user,role:'admin'}}});
 const restored=await b.api.restoreSession();assert.equal(restored.user.role,'admin');assert.equal(b.calls[0].init.headers.Authorization,'Bearer test-token');
});
test('malformed credentials or a different server are rejected before any request',async()=>{
 for(const raw of ['broken',JSON.stringify({...JSON.parse(saved),origin:'https://other.test'})]){
  const a=setup(raw);assert.equal(await a.api.restoreSession(),null);await a.api.restoreSession();assert.equal(a.stored,null);assert.equal(a.calls.length,0);
 }
});
test('network failures retain credential and can be retried',async()=>{
 const a=setup(saved);a.replies.push(new Error('offline'));await assert.rejects(a.api.restoreSession());assert.equal(a.stored,saved);
 a.replies.push({status:200,body:session});assert.equal((await a.api.restoreSession()).user.id,'user');
});
test('revocation clears saved session',async()=>{
 const a=setup(saved);a.replies.push({status:401,body:{}});assert.equal(await a.api.restoreSession(),null);await a.api.restoreSession();assert.equal(a.stored,null);
});
test('logout revokes token and clears persisted session',async()=>{
 const a=setup(saved);a.replies.push({status:200,body:session});await a.api.restoreSession();a.replies.push({status:204});await a.api.signOut();assert.equal(await a.api.restoreSession(),null);assert.equal(a.stored,null);assert.ok(a.calls[1].url.endsWith('/auth/logout'));assert.equal(await a.api.lastAccount(),'test@example.com');
});
test('server can renew a session even when another tab has an old local expiry',async()=>{
 const a=setup(JSON.stringify({...JSON.parse(saved),expires_at:'2000-01-01'}));a.replies.push({status:200,body:session});
 assert.equal((await a.api.restoreSession()).expires_at,session.expires_at);
 assert.equal(JSON.parse(a.stored).expires_at,session.expires_at);
});
