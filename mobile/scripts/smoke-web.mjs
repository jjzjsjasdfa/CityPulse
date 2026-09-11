import { mkdir } from 'node:fs/promises';
import process from 'node:process';

import { chromium } from 'playwright-core';

const executablePath =
  process.env.CHROME_PATH ??
  (process.platform === 'win32'
    ? 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    : undefined);

if (!executablePath) {
  throw new Error('Set CHROME_PATH to a local Chromium or Chrome executable.');
}

const browser = await chromium.launch({ executablePath, headless: true });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
page.on('console', (message) => {
  const expectedOfflineApi =
    message.text().includes('ERR_CONNECTION_REFUSED') &&
    message.location().url.startsWith('http://localhost:8000/');
  if (message.type() === 'error' && !expectedOfflineApi) errors.push(message.text());
});

try {
  await page.goto(process.env.PREVIEW_URL ?? 'http://localhost:4173', {
    waitUntil: 'networkidle',
  });
  await page.getByText('这座城，').waitFor({ timeout: 10_000 });
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/ui-smoke.png', fullPage: true });
  await page.getByRole('button', { name: '查看湘江周末河畔市集' }).click();
  await page.getByText('活动详情').waitFor();
  await page.waitForTimeout(700);
  await page.screenshot({ path: 'artifacts/ui-detail-smoke.png', fullPage: true });
  if (errors.length) throw new Error(`Browser errors:\n${errors.join('\n')}`);
  console.log('Web UI smoke test passed; screenshots written to artifacts/.');
} catch (error) {
  await mkdir('artifacts', { recursive: true });
  await page.screenshot({ path: 'artifacts/ui-smoke-failed.png', fullPage: true });
  if (errors.length) console.error(`Browser errors:\n${errors.join('\n')}`);
  throw error;
} finally {
  await browser.close();
}
