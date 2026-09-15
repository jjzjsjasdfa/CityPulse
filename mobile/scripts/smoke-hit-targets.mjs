import assert from 'node:assert/strict';
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const dataset = await (await fetch('http://localhost:18082/api/v1/demo/dataset')).json();
const origin = dataset.location;
const event = { ...dataset.events[5], location: { ...dataset.events[5].location,
  latitude: origin.latitude, longitude: origin.longitude + 0.004 } };
const point = { ...event, ...event.location };
try {
  for (const touch of [false, true]) {
    const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: touch, isMobile: touch });
    const page = await context.newPage();
    const errors = []; page.on('pageerror', (error) => errors.push(error.message));
    await page.route('**/api/v1/**', async (route) => {
      const path = new URL(route.request().url()).pathname;
      let result;
      if (path.endsWith('/demo')) result = { ...dataset, saved_ids: [] };
      else if (path.endsWith('/nearby-updates')) result = { data: [], meta: {count:0,has_next:false,next_offset:null}, checked_at: new Date().toISOString() };
      else if (path.endsWith('/events/map')) result = {data:[point],meta:{count:1,has_next:false,next_offset:null}};
      else if (path.endsWith('/events')) result = {data:[event],meta:{total:1,page:1,page_size:50,has_next:false}};
      else result = {data:event};
      await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
    });
    await page.goto(process.env.PREVIEW_URL ?? 'http://localhost:18081', {waitUntil:'networkidle'});
    const dot = page.getByTestId(`event-dot-${event.id}`);
    await dot.waitFor(); await page.waitForTimeout(700);
    const b = await dot.boundingBox();
    const center = {x:b.x+b.width/2,y:b.y+b.height/2};
    const click = (x,y) => touch ? page.touchscreen.tap(x,y) : page.mouse.click(x,y);
    for (const [dx,dy] of [[-18,0],[-45,68],[0,76]]) {
      await click(center.x+dx,center.y+dy); await page.waitForTimeout(250);
      assert.equal(await page.getByText('活动详情',{exact:true}).count(),0, `${touch?'touch':'mouse'} blank map offset ${dx},${dy} must not open a neighboring activity`);
    }
    await click(center.x,center.y);
    await page.getByText('活动详情',{exact:true}).waitFor();
    await page.getByRole('button',{name:'关闭活动详情'}).click();
    const label = page.getByTestId(`name-label-${event.id}`);
    const box = await label.boundingBox();
    await click(box.x+box.width/2,box.y+box.height/2);
    await page.getByText('活动详情',{exact:true}).waitFor();
    await page.getByRole('button',{name:'关闭活动详情'}).click();
    if (!touch) {
      await page.getByRole('button',{name:`查看${event.name}`,exact:true}).press('Enter');
      await page.getByText('活动详情',{exact:true}).waitFor();
      await page.getByRole('button',{name:'关闭活动详情'}).click();
    }
    // A gesture beginning on a marker must still pan, without opening details.
    const beforeDrag = await dot.boundingBox();
    const x = beforeDrag.x + beforeDrag.width / 2, y = beforeDrag.y + beforeDrag.height / 2;
    if (touch) {
      const cdp = await context.newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[{x,y}]});
      for (let step = 1; step <= 10; step++) {
        await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:x-step*5,y:y+step*3}]});
        await page.waitForTimeout(25);
      }
      await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]});
      await cdp.detach();
    } else {
      await page.mouse.move(x,y); await page.mouse.down();
      await page.mouse.move(x-50,y+30,{steps:10}); await page.mouse.up();
    }
    await page.waitForTimeout(700);
    assert.equal(await page.getByText('活动详情',{exact:true}).count(),0,'Dragging from a marker must not open details');
    const afterDrag = await dot.boundingBox();
    assert.ok(Math.hypot(afterDrag.x-beforeDrag.x,afterDrag.y-beforeDrag.y)>20,'Dragging from a marker must move the map');
    assert.deepEqual(errors,[]);
    await context.close();
  }
  console.log('Hit target checks passed: mouse/touch blank map passes through, visible dots/labels open details, marker drags pan without opening details, keyboard remains available.');
} finally { await browser.close(); }
