import {chromium} from 'playwright-core';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir} from 'node:fs/promises';
const docker=process.env.DOCKER_PATH||'C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const accounts=['regular','admin'].map(role=>({role,email:`account-smoke-${randomBytes(6).toString('hex')}@example.com`,password:randomBytes(24).toString('hex')}));
function db(code,data){const p=spawnSync(docker,['exec','-i','citypulse-api-1','python','-c',code],{input:JSON.stringify(data),encoding:'utf8'});if(p.status!==0)throw Error(p.stderr);return p.stdout.trim()}
const ids=JSON.parse(db(`import json,sys
from sqlmodel import Session
from app.core.database import engine
from app.core.security import hash_password
from app.models import User
with Session(engine) as s:
 users=[User(email=a['email'],password_hash=hash_password(a['password']),role=a['role']) for a in json.load(sys.stdin)]
 for u in users:s.add(u)
 s.commit();print(json.dumps([str(u.id) for u in users]))`,accounts));
let browser;const errors=[];
try{
 browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:430,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>localStorage.setItem('@citypulse/settings-v1',JSON.stringify({enabled:true,radiusKm:7,monitor:false,cycleSeconds:1,time:null})));
 await page.goto('http://localhost:8081/');
 await page.getByRole('button',{name:'暂不登录，随便看看'}).click();
 await page.getByRole('button',{name:'探索',exact:true}).click();
 await page.getByRole('button',{name:'我的',exact:true}).click();
 await page.getByRole('button',{name:'设置',exact:true}).click();
 if(await page.getByLabel('开启调试功能').count())throw Error('Guest debug control exposed');
 await page.getByRole('button',{name:'前往我的登录'}).click();
 const login=async(a)=>{await page.getByLabel('邮箱',{exact:true}).fill(a.email);await page.getByLabel('密码',{exact:true}).fill(a.password);await page.getByRole('button',{name:'登录',exact:true}).click();await page.getByLabel('邮箱',{exact:true}).waitFor({state:'hidden'});await page.getByRole('button',{name:'我的',exact:true}).click()};
 await login(accounts[0]);
 await page.reload();await page.getByRole('button',{name:'我的',exact:true}).click();
 if(await page.getByRole('button',{name:'登录 / 注册'}).count())throw Error('Session lost on reload');
 await page.route('**/api/v1/auth/session',route=>route.abort());await page.reload();
 await page.getByText('暂时无法连接账号服务，登录信息已保留。',{exact:true}).waitFor();
 await page.unroute('**/api/v1/auth/session');await page.getByRole('button',{name:'重试',exact:true}).click();
 await page.getByRole('button',{name:'我的',exact:true}).click();
 await page.getByRole('button',{name:'设置',exact:true}).click();
 if(await page.getByLabel('开启调试功能').count())throw Error('Regular debug control exposed');
 await page.getByLabel('用户昵称').fill('城市漫游者');await page.getByRole('button',{name:'头像 leaf'}).click();await page.getByRole('button',{name:'保存账号资料'}).click();
 await page.getByText('确认提交昵称审核？',{exact:true}).waitFor();await page.getByRole('button',{name:'提交审核',exact:true}).click();
 await page.getByText('昵称修改已提交，管理员审核通过后生效。',{exact:true}).waitFor();await page.getByText('微信 · 暂未开放',{exact:true}).waitFor();
 await page.getByRole('button',{name:'返回我的'}).click();if(await page.getByText('城市漫游者',{exact:true}).count())throw Error('Pending nickname published early');
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'退出登录',exact:true}).click();
 await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'登录 / 注册'}).click();await login(accounts[1]);
 await page.getByRole('button',{name:'审核',exact:true}).click();await page.getByRole('button',{name:'昵称审核',exact:true}).click();
 await page.getByRole('button',{name:'审核 城市漫游者',exact:true}).click();await page.getByLabel('昵称审核说明').fill('测试昵称合规');await page.getByRole('button',{name:'提交审核决定',exact:true}).click();await page.getByText('昵称已通过并生效',{exact:true}).waitFor();
 await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByLabel('开启调试功能').click();await page.getByRole('button',{name:'应用设置并返回地图'}).click();
 await page.getByRole('button',{name:'应用设置并返回地图'}).waitFor({state:'hidden'});
 await page.getByRole('button',{name:'审核',exact:true}).click();await page.getByText('调试已开启，暂无法审批。正式审批数据保留，关闭调试后可继续处理。',{exact:true}).waitFor();
 await page.screenshot({path:'artifacts/account-debug-review.png'});
 await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'退出登录',exact:true}).click();
 await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'登录 / 注册'}).click();await login(accounts[0]);await page.getByText('城市漫游者',{exact:true}).waitFor();
 await page.getByRole('button',{name:'列表形式',exact:true}).click();await page.getByRole('button',{name:'列表形式',exact:true}).getAttribute('aria-checked');await page.getByRole('button',{name:'卡片形式',exact:true}).click();
 await mkdir('artifacts',{recursive:true});await page.screenshot({path:'artifacts/account-profile.png'});
 await page.getByRole('button',{name:'设置',exact:true}).click();await page.getByRole('button',{name:'退出登录',exact:true}).click();await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'登录 / 注册'}).waitFor();
 if(await page.getByRole('button',{name:'审核',exact:true}).count())throw Error('Admin tab survives logout');
 await page.reload();await page.getByRole('button',{name:'暂不登录，随便看看'}).click();await page.getByRole('button',{name:'我的',exact:true}).click();await page.getByRole('button',{name:'登录 / 注册'}).waitFor();
 if(await page.evaluate(()=>localStorage.getItem('citypulse.session.v1')))throw Error('Logout kept credential');
 await page.getByRole('button',{name:'登录 / 注册'}).click();
 if(await page.getByLabel('邮箱',{exact:true}).inputValue()!==accounts[0].email)throw Error('Last account not prefilled');
 if(await page.getByLabel('密码',{exact:true}).inputValue()!=='')throw Error('Password retained after logout');
 if(errors.length)throw Error(errors.join('\n'));
 console.log(JSON.stringify({passed:true,checks:['guest bypass and map','nickname remains pending','admin nickname approval','profile visible after approval','favorite card/list toggle','WeChat placeholder','debug role isolation','debug approval notice','logout while debugging'],errors}));
}finally{
 await browser?.close();
 db(`import json,sys
from sqlalchemy import text
from app.core.database import engine
with engine.begin() as c:
 for uid in json.load(sys.stdin):
  c.execute(text('DELETE FROM nickname_changes WHERE user_id=:uid OR reviewed_by=:uid'),{'uid':uid})
  c.execute(text('DELETE FROM auth_sessions WHERE user_id=:uid'),{'uid':uid})
  c.execute(text('DELETE FROM users WHERE id=:uid'),{'uid':uid})`,ids);
}
