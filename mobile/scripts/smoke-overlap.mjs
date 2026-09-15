import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const context = await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true});
const page = await context.newPage();
const errors=[]; page.on('pageerror',error=>errors.push(error.message));
try {
  await page.goto('http://localhost:18081');
  await page.getByTestId('event-map').waitFor();
  await page.locator('[data-testid^="activity-halo-"]').first().waitFor();
  assert.equal(await page.getByRole('button',{name:'放大地图',exact:true}).count(),0);
  assert.ok((await page.getByTestId('event-map').boundingBox()).height>=840,'map extends behind floating tabs');
  await page.getByText('虚构测试 · 五一广场 · 7 公里',{exact:true}).waitFor();
  await page.screenshot({path:'artifacts/overlap-mobile.png'});
  const first = await page.locator('[data-testid^="event-marker-"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.testid));
  await page.waitForTimeout(1200);
  const second = await page.locator('[data-testid^="event-marker-"]').evaluateAll(nodes=>nodes.map(node=>node.dataset.testid));
  assert.notDeepEqual(first,second,'overflow activities rotate');
  const boxes = await page.locator('[data-testid^="event-dot-"]').evaluateAll(nodes=>nodes.map(node=>{const b=node.getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2};}));
  for(let i=0;i<boxes.length;i++) for(let j=i+1;j<boxes.length;j++) assert.ok(Math.hypot(boxes[i].x-boxes[j].x,boxes[i].y-boxes[j].y)>30,'dots are separated');
  // Category labels are intentionally read from the live accessible buttons.
  const firstChip=page.getByRole('checkbox',{name:/^筛选/}).first();
  await firstChip.click(); await page.waitForFunction(() => getComputedStyle(document.querySelector('[role="checkbox"][aria-label^="筛选"]')).backgroundColor === 'rgb(255, 255, 255)');
  await firstChip.click();
  await page.getByRole('button',{name:/我的$/}).click();await page.getByRole('button',{name:'设置',exact:true}).click();
  await page.getByText('重叠活动切换间隔 · 1 秒',{exact:true}).waitFor();
  await page.getByRole('button',{name:'加快活动切换'}).click();
  await page.getByText('重叠活动切换间隔 · 0.5 秒',{exact:true}).waitFor();
  await page.screenshot({path:'artifacts/overlap-settings.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS: full screen map, touch controls, default 7 km, overlap rotation, chips, interval settings');
} finally {await context.close();await browser.close();}
