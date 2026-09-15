import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();
const dataset=await(await fetch('http://localhost:18082/api/v1/demo/dataset')).json();
const event={...dataset.events[0],location:{...dataset.events[0].location,latitude:28.195,longitude:112.978}};
const point={...event,latitude:event.location.latitude,longitude:event.location.longitude};
await page.route('**/api/v1/**', async route=>{
  const path=new URL(route.request().url()).pathname;
  let response;
  if(path.endsWith('/events/map')) response={data:[point],meta:{count:1,has_next:false,next_offset:null}};
  else if(path.endsWith('/events/nearby-updates')) response={data:[],meta:{count:0,has_next:false,next_offset:null},checked_at:new Date().toISOString()};
  else if(path.endsWith('/demo')) response={...dataset,saved_ids:[]};
  else if(path.endsWith('/events')) response={data:[event],meta:{total:1,page:1,page_size:50,has_next:false}};
  else response={data:event};
  await route.fulfill({json:response});
});
const halo=()=>page.getByTestId(`activity-halo-${event.id}`);
try {
  await page.clock.install();
  await page.goto('http://localhost:18081'); await halo().waitFor();
  await page.clock.fastForward(20000); assert.equal(await halo().count(),1);
  await page.reload(); await halo().waitFor();
  await page.clock.fastForward(45000); assert.equal(await halo().count(),1,'unfinished launch resets minute');
  await page.clock.fastForward(16000); await page.waitForFunction(()=>document.querySelectorAll('[data-testid^="activity-halo-"]').length===0);
  await page.waitForTimeout(300); await page.reload(); await page.getByTestId(`event-dot-${event.id}`).waitFor();
  await page.waitForTimeout(500); assert.equal(await halo().count(),0,'completed minute stays acknowledged after restart');
  await page.evaluate(()=>localStorage.removeItem('@citypulse/demo/activity-alerts-v1'));
  await page.reload();await halo().waitFor();
  await page.getByTestId(`event-dot-${event.id}`).click();await page.getByRole('button',{name:'关闭活动详情'}).waitFor();
  assert.equal(await halo().count(),0,'opening details cancels immediately');
  await page.reload();await page.getByTestId(`event-dot-${event.id}`).waitFor();await page.waitForTimeout(500);assert.equal(await halo().count(),0,'viewed state persists');
  // Move a fresh version about 8 km east: panning/zooming must not redefine "nearby".
  Object.assign(point,{longitude:113.0587,published_at:new Date().toISOString()});
  const revealFar = async () => {
    await page.reload(); await page.getByTestId('my-location').waitFor();
    for(let i=0;i<8;i++){await page.getByRole('button',{name:'缩小地图',exact:true}).click();await page.clock.runFor(600);}
    await page.clock.runFor(1000);
    await page.screenshot({path:'artifacts/radius-alert-check.png'});
    await page.getByTestId(`event-dot-${event.id}`).waitFor();await page.waitForTimeout(500);
  };
  await revealFar();assert.equal(await halo().count(),0,'8 km event displays normally outside default 7 km, without halo');
  await page.evaluate(()=>localStorage.setItem('@citypulse/settings-v1',JSON.stringify({enabled:true,time:null,radiusKm:30,monitor:false,cycleSeconds:1})));
  await revealFar();await halo().waitFor();
  await page.evaluate(()=>localStorage.setItem('@citypulse/settings-v1',JSON.stringify({enabled:true,time:null,radiusKm:0,monitor:false,cycleSeconds:1})));
  await revealFar();assert.equal(await halo().count(),0,'zero radius disables halos even for visible events');
  console.log('PASS: minute lifecycle, restart, detail acknowledgement, 8 km excluded at radius 7 and included at 30, radius zero');
} finally {await context.close();await browser.close();}
