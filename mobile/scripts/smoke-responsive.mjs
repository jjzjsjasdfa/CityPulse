import {chromium} from 'playwright-core';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const fixture=JSON.parse(await readFile('../backend/fixtures/demo-events.json','utf8'));
const events=fixture.events.slice(0,6);
const browser=await chromium.launch({executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe',headless:true});
try{
 const page=await browser.newPage({viewport:{width:1440,height:960}});const errors=[];
 page.on('pageerror',e=>{errors.push(e.message);console.error(e.message)});
 await page.route('**/api/v1/**',async route=>{
  const path=new URL(route.request().url()).pathname;
  let body={data:[],artists:[],entries:[],references:[],meta:{count:0,has_next:false,next_offset:null}};
  if(path==='/api/v1/events')body={data:events,meta:{page:1,page_size:50,total:events.length,has_next:false}};
  const event=events.find(e=>path===`/api/v1/events/${e.id}`);
  if(event)body={data:{...event,attributes:event.attributes||[],sources:event.sources||[],status_history:event.status_history||[]}};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(body)});
 });
 await page.goto('http://localhost:8081');
 await page.getByRole('button',{name:'暂不登录，随便看看',exact:true}).click();
 await page.getByTestId('layout-desktop').waitFor();
 await page.getByRole('button',{name:`查看${events[0].name}`,exact:true}).click();
 await page.getByRole('button',{name:'关闭活动详情',exact:true}).waitFor();
 assert.equal(await page.getByRole('dialog').count(),0);
 await page.getByRole('button',{name:'探索',exact:true}).click();
 const map=await page.getByLabel('活动地图',{exact:true}).elementHandle();
 assert.ok(map);
 await mkdir('artifacts',{recursive:true});
 for(const [width,mode] of [[1440,'desktop'],[900,'tablet'],[390,'phone'],[1440,'desktop']]){
  await page.setViewportSize({width,height:960});await page.getByTestId(`layout-${mode}`).waitFor();
  assert.equal(await map.evaluate(el=>el.isConnected),true,'Map must not remount on resize');
  await page.getByRole('button',{name:'关闭活动详情',exact:true}).waitFor();
  await page.screenshot({path:`artifacts/responsive-${mode}.png`});
 }
 await page.getByRole('button',{name:'关闭活动详情',exact:true}).click();
 assert.equal(await map.evaluate(el=>el.isConnected),true);
 for(const [width,mode] of [[1440,'desktop'],[900,'tablet'],[390,'phone']]){
  await page.setViewportSize({width,height:960});await page.getByTestId(`layout-${mode}`).waitFor();
  await page.getByRole('button',{name:'探索',exact:true}).click();
  const nav=await page.getByTestId('page-navigation').boundingBox();
  assert.ok(nav);
  if(mode==='desktop'){assert.ok(nav.width<=80);assert.ok(nav.height<400);assert.ok(nav.y<30);}
  if(mode==='tablet'){assert.ok(nav.x<30);assert.ok(nav.y>800);assert.ok(nav.width<=360);}
  const from=await page.getByRole('button',{name:'探索',exact:true}).boundingBox();
  const to=await page.getByRole('button',{name:'我的',exact:true}).boundingBox();
  await page.mouse.move(from.x+from.width/2,from.y+from.height/2);await page.mouse.down();
  await page.mouse.move(to.x+to.width/2,to.y+to.height/2,{steps:12});await page.mouse.up();
  await page.getByText('我的收藏',{exact:true}).waitFor();
  if(mode!=='desktop'){
   const cdp=await page.context().newCDPSession(page);
   await cdp.send('Emulation.setTouchEmulationEnabled',{enabled:true});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:to.x+to.width/2,y:to.y+to.height/2}]});
   for(let step=1;step<=10;step++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:to.x+to.width/2+(from.x-to.x)*step/10,y:from.y+from.height/2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   await page.getByLabel('活动地图',{exact:true}).waitFor();
   await cdp.detach();
  }
  await page.screenshot({path:`artifacts/floating-nav-${mode}.png`});
 }
 assert.deepEqual(errors,[]);
 console.log('PASS: desktop/tablet/phone navigation, persistent open detail, map retained on resize and panel close');
}finally{await browser.close()}
