import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({executablePath:process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const context = await browser.newContext({viewport:{width:390,height:844}});
const page = await context.newPage();
const errors = [], requests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => {if(request.url().includes('/api/v1/')) requests.push(new URL(request.url()));});
await page.addInitScript(() => {
  window.introFrames = [];
  const recordIntro = () => {
    const node = document.querySelector('[data-testid^="startup-wave-"]');
    if (node) window.introFrames.push({time:performance.now(),opacity:Number(getComputedStyle(node).opacity)});
  };
  new MutationObserver(recordIntro).observe(document,{subtree:true,childList:true,attributes:true,attributeFilter:['opacity','style']});
  window.gpsRequests = 0;
  Object.defineProperty(navigator,'geolocation',{value:{
    getCurrentPosition(success) {window.gpsRequests++; success({coords:{latitude:31.23,longitude:121.47,accuracy:12},timestamp:Date.now()});},
    watchPosition(success) {window.gpsRequests++; success({coords:{latitude:31.23,longitude:121.47,accuracy:12},timestamp:Date.now()});return 1;},
    clearWatch() {},
  }});
});
await page.route('http://localhost:8000/**', (route) => route.abort());
const dataset = await (await fetch('http://localhost:18082/api/v1/demo/dataset')).json();
const target = dataset.events[80];
const wave = () => page.locator('[data-testid^="startup-wave-"]');
const zoomOut = async () => {await page.getByRole('button',{name:'缩小地图',exact:true}).click();await page.waitForTimeout(450);};
const settings = async () => {await page.getByRole('button',{name:/我的$/}).click();await page.getByRole('button',{name:'设置',exact:true}).click();};
try {
  await page.goto('http://localhost:18081',{waitUntil:'domcontentloaded'});
  await wave().first().waitFor();
  await page.waitForTimeout(150);
  assert.ok(await wave().count()>=32,'startup shows all nearby categories around the frame');
  assert.ok(await page.evaluate(()=>window.introFrames.some(frame=>frame.opacity>.99)),'startup begins at full brightness');
  await page.screenshot({path:'artifacts/debug-startup.png'});
  await page.waitForTimeout(1600);
  assert.equal(await wave().count(),0,'startup flash must fade into directional guidance');
  await page.getByTestId('map-scale').getByText('500 米',{exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>window.gpsRequests),0,'debug must not request real GPS');
  for(let i=0;i<8;i++) await zoomOut();
  await page.getByTestId(`activity-halo-${target.id}`).waitFor();
  await page.mouse.move(170,420);await page.mouse.down();
  for(let i=1;i<=10;i++) {
    await page.mouse.move(170+i*4,420+i*2);
    const haloBox=await page.getByTestId(`activity-halo-${target.id}`).boundingBox();
    const dotBox=await page.getByTestId(`event-dot-${target.id}`).boundingBox();
    assert.ok(Math.hypot(haloBox.x+haloBox.width/2-dotBox.x-dotBox.width/2,haloBox.y+haloBox.height/2-dotBox.y-dotBox.height/2)<0.25,'halo shares its marker center during every drag step');
  }
  await page.mouse.up();
  const circle = page.getByTestId(`event-dot-${target.id}`);
  assert.equal(await circle.evaluate(node=>getComputedStyle(node).borderTopColor),'rgb(16, 16, 16)');
  assert.equal(await circle.evaluate(node=>getComputedStyle(node).borderTopWidth),'3px');
  await page.screenshot({path:'artifacts/debug-halos.png'});
  await page.getByRole('button',{name:`查看${target.name}`,exact:true}).press('Enter');
  await page.getByText('活动详情',{exact:true}).waitFor();
  await page.getByRole('button',{name:'关闭活动详情'}).click();
  await page.waitForTimeout(250);
  assert.equal(await page.getByTestId(`unread-event-${target.id}`).count(),0);
  assert.equal(await page.getByTestId(`activity-halo-${target.id}`).count(),0);
  assert.equal(await circle.evaluate(node=>getComputedStyle(node).borderTopWidth),'2px');
  await page.waitForTimeout(6500);
  assert.ok(await page.locator('[data-testid^="activity-halo-"]').count()>0,'other halos continue for one minute; complete lifecycle is covered by smoke-alert-lifecycle');
  assert.ok(await page.locator('[data-testid^="unread-event-"]').count()>0);
  await settings();
  await page.getByRole('switch',{name:'自选当前时间'}).click();
  await page.getByRole('textbox',{name:'调试当前时间'}).fill('2028-09-14 12:00');
  await page.screenshot({path:'artifacts/debug-settings.png'});
  await page.getByRole('button',{name:'应用设置并返回地图'}).click();
  await page.getByTestId('my-location').waitFor();await page.waitForTimeout(1500);
  assert.equal(await page.locator('[data-testid^="event-marker-"]').count(),0,'future debug clock must expire fixture activities');
  assert.ok(requests.some(url=>url.searchParams.get('demo_now')?.startsWith('2028-09-14')));
  await settings();
  await page.getByRole('switch',{name:'开启调试功能'}).click();
  const offset = requests.length;
  await page.getByRole('button',{name:'应用设置并返回地图'}).click();
  await page.getByTestId('my-location').waitFor();await page.waitForTimeout(1500);
  assert.ok(await page.evaluate(()=>window.gpsRequests)>0,'real mode must request device location');
  assert.ok(requests.slice(offset).some(url=>url.port==='8000'));
  assert.ok(requests.slice(offset).every(url=>url.port!=='18082'&&!url.searchParams.has('demo_now')));
  assert.equal(await page.getByRole('button',{name:'虚构数据测试设置'}).count(),0);
  assert.equal(await page.locator('[data-testid^="event-marker-"]').count(),0,'real mode must not leak demo favorites/fallbacks');
  await page.screenshot({path:'artifacts/debug-off.png'});
  await settings();
  await page.getByRole('switch',{name:'开启调试功能'}).click();
  await page.getByRole('button',{name:'应用并重播新活动'}).click();
  await wave().first().waitFor();
  await page.waitForTimeout(1700);
  await page.reload({waitUntil:'networkidle'});
  await page.getByRole('button',{name:'虚构数据测试设置'}).waitFor();
  assert.equal(await page.evaluate(()=>window.gpsRequests),0,'saved debug preference survives relaunch');
  assert.deepEqual(errors,[]);
  console.log('Debug checks passed: 500 m startup, full-bright startup waves then guidance, temporary halos, persistent unread borders until opened, custom clock, real GPS/API isolation and replay.');
} catch(error) {await page.screenshot({path:'artifacts/debug-failed.png'});console.error(errors);throw error;}
finally {await browser.close();}
