import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';
const browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const context=await browser.newContext({viewport:{width:390,height:844}});
const page=await context.newPage();const requests=[],errors=[];
page.on('request',request=>{if(request.url().includes('/nearby-updates?'))requests.push(new URL(request.url()));});
page.on('pageerror',error=>errors.push(error.message));
const settings=async()=>{await page.getByRole('button',{name:/我的$/}).click();await page.getByRole('button',{name:'设置',exact:true}).click();};
const setRadius=async(radius)=>{
  const slider=page.getByRole('slider',{name:'新活动提示半径'});await slider.focus();await slider.press('Home');
  for(let i=0;i<radius;i++)await slider.press('ArrowRight');
};
try {
  await page.goto('http://localhost:18081',{waitUntil:'networkidle'});
  await page.getByTestId('performance-monitor').waitFor();
  await page.waitForTimeout(11000);
  const baseline=await page.evaluate(()=>JSON.parse(localStorage.getItem('@citypulse/debug-performance-v1')??'[]'));
  assert.ok(baseline.length>=8,'monitor records rolling samples');
  await page.screenshot({path:'artifacts/performance-baseline.png'});
  await settings();
  assert.equal(await page.getByText('我的收藏',{exact:true}).count(),0);
  await setRadius(0);await page.getByRole('button',{name:'应用设置并返回地图'}).click();
  await page.getByTestId('my-location').waitFor();await page.waitForTimeout(1800);
  assert.equal(await page.locator('[data-testid^="edge-wave-"], [data-testid^="startup-wave-"]').count(),0,'zero radius disables edge signals');
  assert.equal(await page.locator('[data-testid^="activity-halo-"]').count(),0,'zero radius also disables activity halos');
  await settings();await setRadius(30);await page.getByRole('button',{name:'应用并重播新活动'}).click();
  await page.getByTestId('my-location').waitFor();await page.waitForTimeout(1800);
  assert.ok(requests.some(url=>url.searchParams.get('radius_km')==='30'));
  assert.ok(await page.locator('[data-testid^="edge-wave-"]').count()>0);
  await page.screenshot({path:'artifacts/ribbon-30km.png'});
  // Deliberate bounded main-thread stalls verify the warning, not application load.
  await page.evaluate(async()=>{for(let i=0;i<45;i++){const end=performance.now()+80;while(performance.now()<end){}await new Promise(resolve=>setTimeout(resolve,20));}});
  assert.match(await page.getByTestId('performance-monitor').innerText(),/需要优化/);
  await page.screenshot({path:'artifacts/performance-warning.png'});
  await settings();await page.getByRole('switch',{name:'流畅度监测'}).click();
  await page.getByRole('button',{name:'应用设置并返回地图'}).click();await page.getByTestId('my-location').waitFor();
  assert.equal(await page.getByTestId('performance-monitor').count(),0);
  await writeFile('artifacts/performance-report.json',JSON.stringify({baseline,controlledStallWarning:true,errors},null,2));
  assert.deepEqual(errors,[]);
  console.log('Performance checks passed: baseline logging, shared 0–30 km notification radius, deliberate-stall warning and monitor off.');
  console.log(JSON.stringify({baselineFps:baseline.map(sample=>sample.fps),baselineP95:baseline.map(sample=>sample.p95)}));
} catch(error){await page.screenshot({path:'artifacts/performance-failed.png'});throw error;}
finally{await browser.close();}
