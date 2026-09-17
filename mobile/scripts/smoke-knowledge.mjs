// Local Docker + Expo smoke. Uses a unique temporary account and removes its fixtures.
import {chromium} from 'playwright-core';
import {randomBytes} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
const docker=process.env.DOCKER_PATH||'C:/Users/lenovo/AppData/Local/Programs/DockerDesktop/resources/bin/docker.exe';
const credentials={email:`knowledge-smoke-${randomBytes(6).toString('hex')}@example.com`,password:randomBytes(24).toString('hex')};
function db(code,input){const p=spawnSync(docker,['exec','-i','citypulse-api-1','python','-c',code],{input:JSON.stringify(input),encoding:'utf8'});if(p.status!==0)throw new Error(p.stderr);return p.stdout.trim();}
const uid=db(`import json,sys
from sqlmodel import Session
from app.core.database import engine
from app.core.security import hash_password
from app.models import User
d=json.load(sys.stdin)
with Session(engine) as s:
 u=User(email=d['email'],password_hash=hash_password(d['password']),role='admin');s.add(u);s.commit();s.refresh(u);print(u.id)
`,credentials);
let browser;const entryIds=[];const errors=[];
try{
 const base='http://localhost:8000/api/v1';
 const login=await fetch(base+'/auth/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(credentials)}).then(r=>r.json());
 const api=async(path,body)=>{const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Authorization:`Bearer ${login.access_token}`,'Content-Type':'application/json'},body:body?JSON.stringify(body):undefined});if(!r.ok)throw new Error(`API ${path}: ${r.status}`);return r.json()};
 const person=await api('/admin/entries',{kind:'person',name:'测试星河歌手',aliases:['星河测试'],person:{birth_date:'2000-01-01',hometown:'长沙'},description:'网页测试资料',references:[{label:'示例参考',url:'https://example.com/artist'}],note:'临时自动验证'});entryIds.push(person.id);
 await mkdir('artifacts',{recursive:true});
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
 const page=await browser.newPage({viewport:{width:430,height:900}});page.on('pageerror',e=>errors.push(e.message));
 await page.setContent('<div style="font:32px Microsoft YaHei,sans-serif;line-height:2;background:white;padding:30px;width:700px">测试星河音乐节<br>阵容：测试星河歌手<br>时间：2027年10月16日<br>地点：长沙公园<br>主办方：测试文化公司</div>');
 await page.screenshot({path:'artifacts/knowledge-poster.png',fullPage:true});
 const poster=await api('/posters',{image_base64:(await readFile('artifacts/knowledge-poster.png')).toString('base64')});
 await page.goto('http://localhost:8081/');
 await page.getByLabel('邮箱',{exact:true}).fill(credentials.email);await page.getByLabel('密码',{exact:true}).fill(credentials.password);await page.getByRole('button',{name:'登录',exact:true}).click();
 await page.getByText(`${poster.extracted.name} · 待审核 ›`,{exact:true}).click();
 await page.getByText('识别内容可能不准确，请以官方公告为准。',{exact:true}).waitFor();
 if(await page.getByText('查看识别原文',{exact:true}).count())throw new Error('Raw OCR exposed in discovery');
 await page.evaluate(()=>{Object.defineProperty(navigator,'share',{configurable:true,value:async({text})=>{window.__sharedPoster=text}})});
 await page.getByText('分享活动介绍 ↗',{exact:true}).click();
 if(!(await page.evaluate(()=>window.__sharedPoster)).includes('识别内容可能不准确，请以官方公告为准。'))throw new Error('Share disclaimer missing');
 await page.getByText('测试星河歌手 ↗',{exact:true}).click();
 await page.getByText('籍贯：长沙',{exact:true}).waitFor();
 await page.waitForTimeout(350); // Capture after the modal's fade animation.
 await page.screenshot({path:'artifacts/knowledge-person.png'});
 await page.getByText('关闭 ×',{exact:true}).click();
 await page.getByLabel('搜索活动名称').fill('音乐');await page.getByText('模糊搜索更多活动',{exact:true}).click();
 await page.getByRole('button',{name:'审核',exact:true}).click();
 await page.getByRole('button',{name:'海报与词条',exact:true}).click();
 await page.getByRole('button',{name:'词条库',exact:true}).click();
 await page.getByLabel('检索词条').fill('星河测试');await page.getByText('搜索词条',{exact:true}).click();
 await page.getByText('测试星河歌手 · 人物 · 长沙',{exact:true}).click();
 await page.getByLabel('词条名称').waitFor();
 if(await page.getByLabel('词条名称').inputValue()!=='测试星河歌手')throw new Error('Wrong entry selected');
 await page.screenshot({path:'artifacts/knowledge-admin.png',fullPage:true});
 await page.getByRole('button',{name:'海报投稿',exact:true}).click();
 await page.getByRole('button',{name:poster.extracted.name,exact:true}).click();
 await page.getByRole('button',{name:'＋ 随本投稿新建词条',exact:true}).click();
 await page.getByLabel('词条名称').fill('待入库测试品牌');
 await page.getByText('品牌',{exact:true}).click();
 await page.getByLabel('资料核实说明（必填）').fill('待随本次审核提交');
 await page.getByText('确认词条资料',{exact:true}).click();
 await page.getByText('待新建：待入库测试品牌 · 点击移除',{exact:true}).waitFor();
 if((await api('/entries?q='+encodeURIComponent('待入库测试品牌'))).items.length)throw new Error('Draft published before approval');
 await page.screenshot({path:'artifacts/knowledge-review.png',fullPage:true});
 if(errors.length)throw new Error(errors.join('\n'));
 console.log(JSON.stringify({passed:true,checks:['PaddleOCR upload','disclaimer and share text','raw OCR absent from discovery','inline person modal','event search','entry alias search and editor','review draft remains private'],errors}));
}finally{
 await browser?.close();
 db(`import json,sys
from sqlalchemy import text
from app.core.database import engine
d=json.load(sys.stdin)
with engine.begin() as c:
 for sql in ["DELETE FROM knowledge_revisions WHERE reviewer_id=:uid", "DELETE FROM favorites WHERE user_id=:uid", "DELETE FROM poster_submissions WHERE user_id=:uid", "DELETE FROM auth_sessions WHERE user_id=:uid", "DELETE FROM users WHERE id=:uid"]: c.execute(text(sql),{'uid':d['uid']})
 for eid in d['entries']:
  for sql in ["DELETE FROM event_entries WHERE entry_id=:eid", "DELETE FROM entry_names WHERE entry_id=:eid", "DELETE FROM artists WHERE id=:eid", "DELETE FROM entries WHERE id=:eid"]: c.execute(text(sql),{'eid':eid})
 print('temporary fixtures removed')
 `,{uid,entries:entryIds});
}
