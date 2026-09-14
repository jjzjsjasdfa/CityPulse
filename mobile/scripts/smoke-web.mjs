// Browser-only fixtures: these never reach the application database.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir, readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { chromium } from 'playwright-core';

const root = resolve('dist');
const server = createServer(async (request, response) => {
  const path = resolve(root, '.' + new URL(request.url, 'http://localhost').pathname);
  if (path !== root && !path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
  try {
    const file = path === root ? resolve(root, 'index.html') : path;
    const mime = { '.html': 'text/html', '.js': 'application/javascript', '.ico': 'image/x-icon' };
    response.setHeader('Content-Type', mime[extname(file)] ?? 'application/octet-stream');
    response.end(await readFile(file));
  } catch { response.writeHead(404).end(); }
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const executablePath = process.env.CHROME_PATH ?? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
let browser;
let page;
try {
  browser = await chromium.launch({ executablePath, headless: true });
  page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  let formCapture = 0;
  const clickFormAction = async (name) => {
    const control = page.getByRole('button', { name, exact: true });
    await control.scrollIntoViewIfNeeded();
    // Flush Chromium's composited iframe after programmatic scrolling before
    // delivering mouse input, and retain a visual checkpoint of the action.
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: `artifacts/form-action-${++formCapture}.png` });
    await control.click();
  };
  await page.route('https://www.openstreetmap.org/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body>Map tile fixture</body></html>' }));
  const errors = [];
  page.on('pageerror', (error) => { errors.push(error.message); console.error('Browser error:', error.message); });
  const baseTime = Math.floor(Date.now() / 60000) * 60000;
  const localTime = (iso) => new Date(Date.parse(iso) + 8 * 3600000).toISOString().slice(0, 16);
  const start = new Date(baseTime + 3 * 86400000).toISOString();
  const finish = new Date(baseTime + 3 * 86400000 + 7200000).toISOString();
  const updated = new Date().toISOString();
  const pastStart = new Date(baseTime - 10 * 86400000).toISOString();
  const pastFinish = new Date(baseTime - 10 * 86400000 + 7200000).toISOString();
  const candidates = [1, 2, 3].map((number) => ({
    id: `00000000-0000-4000-8000-00000000000${number}`, name: `Browser test concert ${number}`,
    category: 'performance', organizer: null, price: '¥80起', venue_name: '长沙音乐厅',
    address: null, city: '长沙', district: '开福区', starts_at: number === 3 ? pastStart : start, ends_at: null,
    official_url: 'https://www.showstart.com/event/100001', facts: {}, review_status: 'pending',
    updated_at: updated, event_id: null, reviewed_by: null, reviewed_at: null, review_note: null,
  }));
  let events = [];
  let role = 'regular';
  let approvals = 0;
  let rejections = 0;
  let enrichments = 0;
  let privateRequests = 0;
  const corrections = [];
  const revisions = [];
  const publicEvent = (event) => ({ ...event, location: { venue_name: event.venue_name, address: event.address, city: event.city, district: event.district, latitude: event.latitude, longitude: event.longitude } });
  const applyEdit = (event, body) => {
    assert.equal(body.expected_updated_at, event.updated_at);
    const before = { ...event };
    Object.assign(event, body, { updated_at: new Date(Date.now()).toISOString() });
    revisions.unshift({ id: `revision-${revisions.length}`, actor_id: 'admin', correction_id: null, note: body.review_note, before, after: { ...event }, created_at: event.updated_at });
    return event;
  };
  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    const json = (body, status = 200) => route.fulfill({ status, json: body });
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204 });
    if (path === '/auth/register') {
      assert.equal(request.postDataJSON().role, undefined);
      return json({ id: 'regular', email: 'reader@example.com', role: 'regular' }, 201);
    }
    if (path === '/auth/login') {
      role = request.postDataJSON().email.startsWith('admin') ? 'admin' : 'regular';
      return json({ access_token: 'browser-fixture-token', token_type: 'bearer', expires_at: new Date(Date.now() + 3600000).toISOString(), user: { id: role, role, email: request.postDataJSON().email } });
    }
    if (path === '/auth/logout') return route.fulfill({ status: 204 });
    if (path === '/corrections') {
      const report = { ...request.postDataJSON(), id: 'report-1', status: 'pending', updated_at: updated, created_at: updated, reviewed_by: null, resolution_note: null };
      corrections.push(report);
      return json({ data: { id: report.id, status: report.status, created_at: report.created_at } }, 202);
    }
    if (path.startsWith('/admin/')) {
      privateRequests++;
      assert.equal(role, 'admin');
      assert.equal(request.headers().authorization, 'Bearer browser-fixture-token');
      if (path === '/admin/events') {
        const offset = Number(url.searchParams.get('offset'));
        const rows = events.filter((event) => (!url.searchParams.has('published') || event.is_published === (url.searchParams.get('published') === 'true')) && event.name.includes(url.searchParams.get('q') ?? ''));
        return json(rows.slice(offset, offset + 20));
      }
      if (path.startsWith('/admin/events/')) {
        const event = events.find((event) => path.includes(event.id));
        if (path.endsWith('/revisions')) return json(revisions);
        if (request.method() === 'PUT') return json(applyEdit(event, request.postDataJSON()));
        return json(event);
      }
      if (path === '/admin/corrections') return json(corrections.filter((report) => report.status === url.searchParams.get('status')));
      if (path.startsWith('/admin/corrections/')) {
        const report = corrections.find((report) => path.includes(report.id));
        const body = request.postDataJSON();
        assert.equal(body.expected_updated_at, report.updated_at);
        if (body.event_update) applyEdit(events.find((event) => event.id === report.event_id), body.event_update);
        Object.assign(report, { status: body.status, resolution_note: body.resolution_note, updated_at: new Date(Date.now()).toISOString() });
        return json(report);
      }
      if (path.endsWith('/comparison')) return json({ event_id: null, changes: [] });
      if (request.method() === 'GET') return json(candidates.filter((candidate) => candidate.review_status === url.searchParams.get('status')));
      const candidate = candidates.find((candidate) => path.includes(candidate.id));
      const body = request.postDataJSON();
      assert.equal(body.expected_updated_at, candidate.updated_at);
      if (path.endsWith('/enrich')) {
        enrichments++;
        Object.assign(candidate, {
          address: 'Source fixture address', ends_at: finish, latitude: 28.25, longitude: 112.98,
          updated_at: new Date(Date.now() + 1000).toISOString(),
          enrichment: { detail_status: 'ok', time_text: '来源演出时间', location_method: 'showstart', warnings: [], place_matches: [] },
        });
        return json(candidate);
      }
      assert.ok(body.review_note);
      candidate.review_note = body.review_note;
      candidate.reviewed_at = updated;
      if (path.endsWith('/approve')) {
        approvals++;
        assert.equal(Date.parse(body.ends_at), Date.parse(candidate.id.endsWith('3') ? pastFinish : finish));
        assert.equal(body.latitude, 28.25);
        candidate.review_status = 'approved';
        candidate.event_id = candidate.id;
        events.push({ ...body, id: candidate.id, slug: candidate.id, updated_at: updated, is_published: true, attributes: [], is_demo: false, is_ad: false, is_new: true, is_ending_soon: true, last_verified_at: updated, confidence: 0.7 });
      } else { rejections++; candidate.review_status = 'rejected'; }
      return json(candidate);
    }
    if (path === '/events') {
      assert.ok(!url.searchParams.has('category') || url.searchParams.get('category') !== 'past');
      const past = url.searchParams.get('time_scope') === 'past';
      const visible = events.filter((event) => event.is_published && (Date.parse(event.ends_at) < Date.now()) === past && event.name.toLowerCase().includes((url.searchParams.get('q') ?? '').toLowerCase()));
      const pageNumber = Number(url.searchParams.get('page') ?? 1);
      return json({ data: visible.slice((pageNumber - 1) * 50, pageNumber * 50).map(publicEvent), meta: { page: pageNumber, page_size: 50, total: visible.length, has_next: pageNumber * 50 < visible.length } });
    }
    if (path.startsWith('/events/')) {
      const event = events.find((event) => path.endsWith(event.id));
      return json({ data: { ...publicEvent(event), official_url: event.evidence_url, sources: [], status_history: [] } });
    }
    throw new Error(`Unexpected API request: ${path}`);
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: '没有账号？注册' }).click();
  await page.getByLabel('邮箱', { exact: true }).fill('reader@example.com');
  await page.getByLabel('密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '注册并登录', exact: true }).click();
  await page.getByText('这个筛选下还没有已审核的活动。').waitFor();
  assert.equal(await page.getByRole('button', { name: '✓ 审核', exact: true }).count(), 0);
  assert.equal(privateRequests, 0);
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill('admin@example.com');
  await page.getByLabel('密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '✓ 审核', exact: true }).click();
  await page.getByText('Browser test concert 1', { exact: true }).click();
  await page.getByLabel('审核记录 / 拒绝原因', { exact: true }).fill('Verified browser test');
  await page.getByRole('button', { name: '通过并公开', exact: true }).click();
  const feedback = page.getByTestId('review-submit-feedback');
  await feedback.getByText('未能提交审核', { exact: true }).waitFor();
  // The failure must be visible from the submission position on a phone-sized viewport.
  const waitForVisibleFeedback = () => page.waitForFunction(() => {
    const element = document.querySelector('[data-testid="review-submit-feedback"]');
    const rect = element?.getBoundingClientRect();
    return rect && rect.top >= 0 && rect.bottom <= window.innerHeight - 72;
  });
  await waitForVisibleFeedback();
  assert.ok((await feedback.textContent()).includes('摘要'));
  assert.equal(approvals, 0);
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/admin-validation-smoke.png', fullPage: true });
  await page.getByRole('button', { name: '通过并公开', exact: true }).click();
  await waitForVisibleFeedback();
  await page.getByLabel('摘要', { exact: true }).fill('Browser test summary');
  assert.equal(await page.getByText('请填写摘要', { exact: true }).count(), 0);
  await page.getByLabel('详细地址', { exact: true }).fill('Manually verified address');
  await page.getByRole('button', { name: '补充详情和地点', exact: true }).click();
  await page.getByText('已完成补采，手动修改的字段已保留，请核对补充结果。').waitFor();
  assert.equal(await page.getByLabel('详细地址', { exact: true }).inputValue(), 'Manually verified address');
  assert.equal(await page.getByLabel('结束时间（含时区）', { exact: true }).inputValue(), localTime(finish));
  assert.equal(await page.getByLabel('纬度（WGS84）', { exact: true }).inputValue(), '28.25');
  for (const [label, value] of [
    ['摘要', 'Browser test summary'], ['活动说明', 'Browser test description'],
    ['主办方', 'Browser test organizer'], ['审核记录 / 拒绝原因', 'Verified browser test'],
  ]) await page.getByLabel(label, { exact: true }).fill(value);
  assert.equal(await page.locator('iframe[title="活动地点预览"]').count(), 1);
  await page.getByRole('button', { name: '保存草稿', exact: true }).click();
  await page.getByText('草稿已保存到本机。').waitFor();
  await page.getByRole('button', { name: '← 返回列表', exact: true }).click();
  await page.getByText('Browser test concert 1', { exact: true }).click();
  await page.getByRole('button', { name: '恢复草稿', exact: true }).click();
  assert.equal(await page.getByLabel('摘要', { exact: true }).inputValue(), 'Browser test summary');
  assert.equal(await page.getByLabel('详细地址', { exact: true }).inputValue(), 'Manually verified address');
  await page.getByRole('button', { name: '通过并公开', exact: true }).click();
  await page.getByText('审核通过，活动已公开。').waitFor();
  await page.getByText('Browser test concert 2', { exact: true }).click();
  await page.getByRole('button', { name: '拒绝', exact: true }).click();
  await feedback.getByText('未能提交审核', { exact: true }).waitFor();
  await waitForVisibleFeedback();
  assert.equal(rejections, 0);
  await page.getByLabel('审核记录 / 拒绝原因', { exact: true }).fill('Incorrect test listing');
  await page.getByRole('button', { name: '拒绝', exact: true }).click();
  await page.getByText('候选活动已拒绝。').waitFor();
  await page.getByText('Browser test concert 3', { exact: true }).click();
  for (const [label, value] of [
    ['摘要', 'Past concert summary'], ['活动说明', 'Past concert description'],
    ['结束时间（含时区）', localTime(pastFinish)], ['详细地址', 'Verified address'],
    ['纬度（WGS84）', '28.25'], ['经度（WGS84）', '112.98'],
    ['主办方', 'Verified organizer'], ['审核记录 / 拒绝原因', 'Verified historical event'],
  ]) await page.getByLabel(label, { exact: true }).fill(value);
  await page.getByText('该活动已结束。通过后将显示在发现页的「往期活动」，不会出现在近期活动中。').waitFor();
  await clickFormAction('通过并公开');
  await page.getByText('审核通过，活动已公开。该活动已结束，可在发现页的「往期活动」中查看。').waitFor();
  await page.getByRole('button', { name: '⌁ 发现', exact: true }).click();
  await page.getByRole('button', { name: '查看Browser test concert 1' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '查看Browser test concert 3' }).count(), 0);
  await page.getByRole('button', { name: '往期活动', exact: true }).click();
  await page.getByRole('button', { name: '查看Browser test concert 3' }).waitFor();
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/admin-review-smoke.png', fullPage: true });
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill('reader@example.com');
  await page.getByLabel('密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '查看Browser test concert 1' }).waitFor();
  assert.equal(await page.getByText('Browser test concert 2', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('button', { name: '✓ 审核', exact: true }).count(), 0);
  await page.getByRole('button', { name: '往期活动', exact: true }).click();
  await page.getByRole('button', { name: '查看Browser test concert 3' }).waitFor();
  assert.equal(await page.getByRole('button', { name: '查看Browser test concert 1' }).count(), 0);
  await page.screenshot({ path: 'artifacts/regular-feed-smoke.png', fullPage: true });
  // A real user report reaches the admin inbox and updates the public event.
  await page.getByRole('button', { name: '全部', exact: true }).click();
  await page.getByRole('button', { name: '查看Browser test concert 1' }).click();
  await page.getByRole('button', { name: '发现信息有误？提交纠错', exact: true }).click();
  await page.getByLabel('纠错说明').fill('The event venue address needs a correction.');
  await page.getByRole('button', { name: '提交审核', exact: true }).click();
  await page.getByText('纠错已进入审核队列，感谢你帮助保持信息准确。').waitFor();
  await page.getByRole('button', { name: '×', exact: true }).click();
  await page.getByRole('button', { name: '退出', exact: true }).click();
  await page.getByLabel('邮箱', { exact: true }).fill('admin@example.com');
  await page.getByLabel('密码', { exact: true }).fill('browser-test-password');
  await page.getByRole('button', { name: '登录', exact: true }).click();
  await page.getByRole('button', { name: '✓ 审核', exact: true }).click();
  await page.getByRole('button', { name: '纠错收件箱', exact: true }).click();
  await page.getByText('The event venue address needs a correction.', { exact: true }).click();
  await page.getByRole('button', { name: '编辑活动并应用纠错', exact: true }).click();
  await page.getByLabel('详细地址', { exact: true }).fill('Corrected address from admin');
  await page.getByLabel('审核记录 / 拒绝原因', { exact: true }).fill('Verified venue correction');
  await clickFormAction('保存活动并接受纠错');
  await page.getByText('已保存，公开活动信息已同步。').waitFor();
  assert.equal(corrections[0].status, 'accepted');
  assert.equal(events[0].address, 'Corrected address from admin');
  await page.getByRole('button', { name: '活动管理', exact: true }).click();
  await page.getByText('Browser test concert 1', { exact: true }).click();
  await clickFormAction('已取消');
  await page.getByLabel('审核记录 / 拒绝原因', { exact: true }).fill('Confirmed cancellation');
  await clickFormAction('保存活动修改');
  await page.getByText('已保存，公开活动信息已同步。').waitFor();
  assert.equal(events[0].status, 'cancelled');
  await page.getByText('Browser test concert 1', { exact: true }).click();
  await clickFormAction('下架');
  await page.getByLabel('审核记录 / 拒绝原因', { exact: true }).fill('Remove from public listing');
  await clickFormAction('保存活动修改');
  await page.getByText('已保存，公开活动信息已同步。').waitFor();
  await page.getByRole('button', { name: '⌁ 发现', exact: true }).click();
  await page.getByText('这个筛选下还没有已审核的活动。').waitFor();
  assert.equal(events[0].is_published, false);
  await page.screenshot({ path: 'artifacts/management-smoke.png', fullPage: true });

  // Exercise a second page and resetting pagination when search/date filters change.
  for (let number = 0; number < 55; number++) events.push({ ...events[0], id: `discovery-${number}`, name: `Discovery concert ${String(number).padStart(2, '0')}`, is_published: true, status: 'announced' });
  await page.getByLabel('搜索活动').fill('Discovery');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByText('已显示 50 / 55 个仍在有效期内的城市动态').waitFor();
  await page.getByRole('button', { name: '加载更多', exact: true }).click();
  await page.getByText('已显示 55 / 55 个仍在有效期内的城市动态').waitFor();
  // The virtualized list revises its scroll height as more rows are measured.
  for (let attempt = 0; attempt < 10 && await page.getByRole('button', { name: '查看Discovery concert 54' }).count() === 0; attempt++) {
    await page.getByTestId('event-feed').evaluate((element) => { element.scrollTop = element.scrollHeight; });
    await page.waitForTimeout(100);
  }
  await page.getByRole('button', { name: '查看Discovery concert 54' }).waitFor();
  await page.getByLabel('搜索活动').fill('Discovery concert 54');
  await page.getByRole('button', { name: '搜索', exact: true }).click();
  await page.getByText('已显示 1 / 1 个仍在有效期内的城市动态').waitFor();
  const todayRequest = page.waitForRequest((request) => request.url().includes('/events?') && new URL(request.url()).searchParams.get('when') === 'today');
  await page.getByRole('button', { name: '今天', exact: true }).click();
  assert.equal(new URL((await todayRequest).url()).searchParams.get('page'), '1');
  const weekendRequest = page.waitForRequest((request) => request.url().includes('/events?') && new URL(request.url()).searchParams.get('when') === 'weekend');
  await page.getByRole('button', { name: '本周末', exact: true }).click();
  await weekendRequest;
  await page.screenshot({ path: 'artifacts/discovery-smoke.png', fullPage: true });
  assert.equal(approvals, 2);
  assert.equal(rejections, 1);
  assert.equal(enrichments, 1);
  assert.deepEqual(errors, []);
  console.log('Browser smoke passed: roles, drafts, date inputs, enrichment, review, past feed, correction application, event management, search, pagination and date filters.');
} catch (error) {
  if (page) {
    console.error((await page.locator('body').innerText()).slice(-2500));
    await mkdir('artifacts', { recursive: true });
    await page.screenshot({ path: 'artifacts/smoke-failure.png', fullPage: true });
  }
  throw error;
} finally {
  if (browser) await browser.close();
  await new Promise((resolve) => server.close(resolve));
}
