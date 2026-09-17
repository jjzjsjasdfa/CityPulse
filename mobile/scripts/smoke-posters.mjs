import { chromium } from 'playwright-core';
import { randomBytes } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true });
try {
  const page = await browser.newPage({viewport:{width:900,height:700}});
  await page.setContent('<div style="font:32px Microsoft YaHei,sans-serif;line-height:2;background:white;color:black;padding:40px">测试星河音乐节<br>阵容：测试歌手、测试乐队<br>时间：2027年10月16日<br>地点：长沙橘子洲<br>主办方：测试文化公司</div>');
  await page.screenshot({path:'artifacts/ocr-test-poster.png'});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.setViewportSize({width:390,height:844});
  await page.goto(process.env.APP_URL || 'http://localhost:8081/');
  await page.getByRole('button',{name:'没有账号？注册'}).click();
  await page.getByLabel('邮箱',{exact:true}).fill('poster-smoke-check@example.com');
  await page.getByLabel('密码',{exact:true}).fill(randomBytes(20).toString('hex'));
  await page.getByRole('button',{name:'注册并登录'}).click();
  await page.getByRole('button',{name:'＋ 上传活动海报'}).waitFor();
  await page.screenshot({path:'artifacts/poster-discovery-mobile.png',fullPage:true});
  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button',{name:'＋ 上传活动海报'}).click();
  await (await chooser).setFiles(process.env.POSTER_PATH || resolve('artifacts/ocr-test-poster.png'));
  if (process.env.POSTER_PATH) {
    await page.getByText('RAN HIPHOP',{exact:true}).first().waitFor({timeout:180000});
    await page.getByText('海报阵容：杨和苏KeyNG、王以太、Rapeter吴嘉轩、Top Barry、陈一豪Clear',{exact:true}).waitFor();
    await page.getByText('时间：2026.09.25 19:30',{exact:true}).waitFor();
  } else {
  await page.getByText('主办方：测试文化公司',{exact:true}).waitFor({timeout:60000});
  await page.getByText('海报阵容：测试歌手、测试乐队',{exact:true}).waitFor();
  await page.getByText('地点：长沙橘子洲',{exact:true}).waitFor();
  await page.getByText('海报阵容：测试歌手、测试乐队',{exact:true}).scrollIntoViewIfNeeded();
  }
  await page.screenshot({path:'artifacts/poster-result-mobile.png',fullPage:true});
  console.log(JSON.stringify({errors,text:await page.locator('body').innerText()}));
  if(errors.length)throw new Error(errors.join('\n'));
} finally {await browser.close()}
