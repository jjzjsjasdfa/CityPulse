import {chromium} from 'playwright-core';
import assert from 'node:assert/strict';
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try {
 const page=await browser.newPage();const errors=[];const decisions=[];let fail=true;
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 page.on('console',message=>{if(message.type()==='error')console.error(message.text())});
 await page.addInitScript(()=>localStorage.setItem('citypulse.session.v1',JSON.stringify({access_token:'test-token',expires_at:'2099-01-01T00:00:00Z',origin:'http://localhost:8000/api/v1'})));
 await page.route('**/api/v1/**',async route=>{
  const url=new URL(route.request().url());let body={data:[],items:[],meta:{has_next:false,total:0}};let status=200;
  if(url.pathname.endsWith('/auth/session'))body={access_token:'test-token',expires_at:'2099-01-01T00:00:00Z',user:{id:'admin',email:'admin@example.com',role:'admin',nickname:'管理员'}};
  if(url.pathname.endsWith('/admin/candidates'))body=[];
  if(url.pathname.endsWith('/admin/nickname-changes'))body=url.searchParams.get('status')==='pending'?[{id:'one',email:'one@example.com',current_nickname:'旧昵称',proposed_nickname:'城市漫游者',status:'pending',review_note:''}]:[];
  if(url.pathname.endsWith('/one/review')){decisions.push(route.request().postDataJSON());if(fail){status=409;body={error:{message:'申请已经被其他管理员处理'}};fail=false;}else body={};}
  await route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto(process.env.SMOKE_URL||'http://localhost:8081');
 await page.getByRole('button',{name:'审核',exact:true}).click();
 await page.getByRole('button',{name:'昵称审核',exact:true}).click();
 await page.getByRole('button',{name:'审核 城市漫游者',exact:true}).waitFor();
 await page.getByLabel('搜索当前列表').fill('不存在');await page.getByText('暂无申请',{exact:true}).waitFor();
 await page.getByLabel('搜索当前列表').fill('one@example.com');
 await page.getByRole('button',{name:'审核 城市漫游者',exact:true}).click();
 await page.getByLabel('昵称审核说明').fill('核对通过');
 await page.getByRole('button',{name:'提交审核决定',exact:true}).click();
 await page.getByText('申请已经被其他管理员处理',{exact:true}).waitFor();
 await page.getByRole('button',{name:'提交审核决定',exact:true}).click();
 await page.getByText('昵称已通过并生效',{exact:true}).waitFor();
 await page.getByRole('button',{name:'审核 城市漫游者',exact:true}).click();
 await page.getByRole('combobox',{name:/审核决定/}).click();await page.getByRole('option',{name:'拒绝昵称'}).click();
 await page.getByLabel('昵称审核说明').fill('请更换昵称');await page.getByRole('button',{name:'提交审核决定',exact:true}).click();
 await page.getByText('昵称申请已拒绝',{exact:true}).waitFor();
 assert.deepEqual(decisions,[{approve:true,note:'核对通过'},{approve:true,note:'核对通过'},{approve:false,note:'请更换昵称'}]);assert.deepEqual(errors,[]);
 console.log('PASS: React-admin nickname search, conflict feedback, approval and rejection');
}finally{await browser.close()}
