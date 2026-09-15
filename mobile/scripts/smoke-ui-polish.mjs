import assert from 'node:assert/strict';
import {chromium} from 'playwright-core';
const browser=await chromium.launch({executablePath:'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',headless:true});
const page=await browser.newPage({viewport:{width:390,height:844}});
try {
  await page.goto('http://localhost:18081');
  const scroll=page.getByTestId('category-scroll');await scroll.waitFor();
  await page.waitForTimeout(700);
  const before=await page.getByRole('checkbox').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-checked')));
  const box=await scroll.boundingBox();
  await page.mouse.move(box.x+290,box.y+18);await page.mouse.down();await page.mouse.move(box.x+40,box.y+18,{steps:12});await page.mouse.up();
  assert.ok(await scroll.evaluate(node=>node.scrollLeft)>150,'mouse drag scrolls narrow category row');
  assert.deepEqual(await page.getByRole('checkbox').evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-checked'))),before,'drag does not toggle category');
  await page.getByRole('checkbox',{name:'筛选季节活动'}).click();
  assert.equal(await page.getByRole('checkbox',{name:'筛选季节活动'}).getAttribute('aria-checked'),'false');
  for(const name of ['发现','地图','我的']) {
    const button=page.getByRole('button',{name,exact:true});await button.waitFor();
    const icon=await button.locator('svg').boundingBox();assert.equal(icon.width,24);assert.equal(icon.height,24);
  }
  await page.screenshot({path:'artifacts/ui-polish-map.png'});
  await page.getByRole('button',{name:'发现',exact:true}).click();
  assert.equal(await page.getByText('事实优先，不让热度替你决定',{exact:true}).count(),0);
  assert.equal(await page.getByText('长沙⌄',{exact:true}).count(),0);
  await page.screenshot({path:'artifacts/ui-polish-feed.png'});
  console.log('PASS: mouse category drag, no accidental toggles, equal nav icons, map navigation, clean feed header');
} finally {await browser.close();}
