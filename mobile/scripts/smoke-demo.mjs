import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const url = process.env.PREVIEW_URL ?? 'http://localhost:18081';
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe', headless: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const errors = [], requests = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('request', (request) => { if (request.url().includes('/events/map?')) requests.push(new URL(request.url())); });
const dataset = await (await fetch('http://localhost:18082/api/v1/demo/dataset')).json();
const saved = new Set(dataset.saved_ids);
const countMarkers = () => page.locator('[data-testid^="event-marker-"]').count();
const labelOpacity = (kind) => page.locator(`[data-testid^="${kind}-label-"]`).evaluateAll((nodes) =>
  nodes.map((node) => Number(getComputedStyle(node).opacity)));
async function waitTiles(target) {
  await target.waitForFunction(() => {
    const tiles = [...document.querySelectorAll('.leaflet-tile')];
    return tiles.length > 0 && tiles.every((tile) => tile.complete && tile.naturalWidth > 0);
  }, undefined, { timeout: 20000 });
  await target.waitForTimeout(350);
}
async function shot(name) { await waitTiles(page); await page.screenshot({ path: `artifacts/demo-${name}.png` }); }
async function zoomOut() {
  await page.getByRole('button', { name: '缩小地图', exact: true }).click();
  await page.waitForTimeout(450);
}
async function assertTabMemory(target) {
  const scale = await target.getByTestId('map-scale').innerText();
  const before = await target.getByTestId('my-location').boundingBox();
  for (const tab of ['发现', '我的']) {
    await target.getByRole('button', {name:new RegExp(`${tab}$`)}).click();
    assert.equal(await target.getByTestId('event-map').count(), 0);
    await target.getByText('地图', {exact:true}).click();
    await target.getByTestId('my-location').waitFor();
    await target.waitForTimeout(750);
    assert.equal(await target.getByTestId('map-scale').innerText(), scale, `${tab} round trip must preserve zoom`);
    const after = await target.getByTestId('my-location').boundingBox();
    assert.ok(Math.hypot(after.x-before.x,after.y-before.y)<2, `${tab} round trip must preserve map position`);
  }
}
try {
  await mkdir('artifacts', { recursive: true });
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.getByTestId('my-location').waitFor();
  await page.getByTestId('map-scale').getByText('500 米', { exact: true }).waitFor();
  await page.waitForTimeout(1200);
  assert.equal(await page.getByText('活动地图', { exact: true }).count(), 0);
  for (const text of ['远景', '省域', '城市', '街区']) assert.equal(await page.getByRole('button', { name: `缩放到${text}` }).count(), 0);
  assert.ok(await countMarkers() >= 10, 'dense central activities must be visible in the smaller default viewport');
  assert.ok((await labelOpacity('name')).some((alpha) => alpha === 1));
  const initialRequests = requests.length;
  assert.ok(initialRequests > 0 && requests.every((request) => request.port === '18082'));
  await shot('neighborhood');

  // Observe actual intermediate label opacity while crossing the name threshold.
  let intermediate = false;
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: '缩小地图', exact: true }).click();
    for (let frame = 0; frame < 6; frame++) {
      await page.waitForTimeout(45);
      if ((await labelOpacity('name')).some((alpha) => alpha > 0.02 && alpha < 0.98)) intermediate = true;
    }
    await page.waitForTimeout(180);
  }
  assert.ok(intermediate, 'name/category transitions must contain intermediate frames');
  assert.ok((await labelOpacity('category')).some((alpha) => alpha > 0.95));
  assert.notEqual(await page.getByTestId('map-scale').innerText(), '500 米');
  await shot('city');
  for (let i = 0; i < 4; i++) await zoomOut();
  await page.waitForTimeout(800);
  assert.ok((await labelOpacity('category')).every((alpha) => alpha < 0.01));
  assert.ok(await countMarkers() >= 35, 'dot viewport should contain dense and sparse locations');
  await shot('province');
  const beforeSavedRequests = requests.length;
  for (let i = 0; i < 2; i++) await zoomOut();
  await page.waitForTimeout(900);
  const ids = await page.locator('[data-testid^="event-marker-"]').evaluateAll((nodes) => nodes.map((node) => node.dataset.testid.replace('event-marker-', '')));
  assert.ok(ids.length > 1 && ids.every((id) => saved.has(id)), 'regional viewport must already only show saved events');
  assert.equal(requests.length, beforeSavedRequests, 'saved-only zoom must stop fetching all map events');
  await shot('national');
  await page.getByRole('button', { name: '回到我的位置' }).click();
  await page.getByTestId('map-scale').getByText('500 米', { exact: true }).waitFor();
  await page.waitForTimeout(800);

  await page.getByRole('button', { name: '虚构数据测试设置' }).click();
  await page.getByRole('button', { name: '模拟附近新活动' }).click();
  await page.getByText('已更新周围 8 个方向的 16 条活动', { exact: true }).waitFor();
  await page.getByRole('button', { name: '虚构数据测试设置' }).click();
  await page.waitForTimeout(1000);
  assert.ok(await page.locator('[data-testid^="edge-wave-"]').count() >= 16);
  await shot('new-activities');
  for (let i = 0; i < 8; i++) await zoomOut();
  await page.waitForTimeout(3200);
  const publishedIds = dataset.events.slice(80,96).map(event=>event.id);
  const pendingIds = () => page.evaluate(() => JSON.parse(localStorage.getItem('@citypulse/demo/nearby-updates-v2')).pending.map(event=>event.id));
  assert.ok((await pendingIds()).every(id=>!publishedIds.includes(id)), 'all republished activities inside the smaller viewport must stop guiding; farther edge activities remain');
  await page.reload({ waitUntil: 'networkidle' });
  await page.getByTestId('my-location').waitFor();
  await page.getByTestId('map-scale').getByText('500 米', {exact:true}).waitFor();
  await page.waitForTimeout(900);
  assert.ok((await pendingIds()).every(id=>!publishedIds.includes(id)), 'seen state must survive restart');
  const beforeWheel = await page.getByTestId('map-scale').innerText();
  await page.mouse.move(195, 380); await page.mouse.wheel(0, 320);
  await page.waitForTimeout(800);
  assert.notEqual(await page.getByTestId('map-scale').innerText(), beforeWheel);
  await page.mouse.move(195, 360); await page.mouse.down();
  await page.mouse.move(110, 425, {steps:12}); await page.mouse.up();
  await page.waitForTimeout(800);
  await assertTabMemory(page);
  await page.getByRole('button', { name: '回到我的位置' }).click();
  await page.waitForTimeout(800);
  // A keyboard user can open any dense marker even if another dot overlaps it.
  await page.locator('.citypulse-marker[role="button"]').first().press('Enter');
  await page.getByText('活动详情', { exact: true }).waitFor();
  await page.getByText('演示数据，不代表真实举办信息', { exact: true }).waitFor();
  await page.getByRole('button', { name: '关闭活动详情' }).click();

  // Real browser touch events, no internal map methods or fabricated app state.
  const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true, deviceScaleFactor: 1 });
  const touchPage = await mobile.newPage();
  await touchPage.addInitScript(() => Object.defineProperty(navigator, 'geolocation', { value: {
    getCurrentPosition() { throw new Error('Demo must not request real GPS'); },
    watchPosition() { throw new Error('Demo must not watch real GPS'); }, clearWatch() {},
  } }));
  touchPage.on('pageerror', (error) => errors.push(error.message));
  await touchPage.goto(url, { waitUntil: 'networkidle' });
  await touchPage.getByTestId('my-location').waitFor();
  assert.equal(await touchPage.getByRole('button', { name: '放大地图', exact: true }).count(), 0);
  assert.equal(await touchPage.getByRole('button', { name: '缩小地图', exact: true }).count(), 0);
  const beforePinch = await touchPage.getByTestId('map-scale').innerText();
  const initialPosition = await touchPage.getByTestId('my-location').boundingBox();
  const cdp = await mobile.newCDPSession(touchPage);
  const fingers = (radius) => [{ x: 195 - radius, y: 380, id: 1 }, { x: 195 + radius, y: 380, id: 2 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: fingers(145) });
  for (let i = 1; i <= 20; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: fingers(145 - i * 6) });
    await touchPage.waitForTimeout(25);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await touchPage.waitForTimeout(1000);
  assert.notEqual(await touchPage.getByTestId('map-scale').innerText(), beforePinch, 'two fingers must change the real map scale');
  await assertTabMemory(touchPage);
  await waitTiles(touchPage);
  await touchPage.screenshot({ path: 'artifacts/demo-touch-pinch.png' });
  await touchPage.reload({waitUntil:'networkidle'});
  await touchPage.getByTestId('my-location').waitFor();
  await touchPage.waitForTimeout(900);
  assert.equal(await touchPage.getByTestId('map-scale').innerText(), beforePinch, 'new launch must restore default scale');
  const restartedPosition = await touchPage.getByTestId('my-location').boundingBox();
  assert.ok(Math.hypot(restartedPosition.x-initialPosition.x,restartedPosition.y-initialPosition.y)<2, 'new launch must center on current location');
  await mobile.close();
  assert.deepEqual(errors, []);
  console.log('Demo checks passed: smaller animated detail levels, early favorites-only view, dynamic scale, new activity waves, mouse/touch tab camera restoration, fresh-launch location reset, and real two-finger zoom.');
} catch (error) {
  console.error({ errors, markers: await countMarkers(), lastRequest: requests.at(-1)?.search, scale: await page.getByTestId('map-scale').innerText().catch(() => '') });
  await page.screenshot({ path: 'artifacts/demo-failed.png' });
  throw error;
} finally { await browser.close(); }
