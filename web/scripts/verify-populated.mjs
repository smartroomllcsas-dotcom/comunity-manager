import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
await page.goto('https://www.comunitymanager.io/login', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'leonelzc2005@gmail.com');
await page.fill('input[type=password]', '123456789');
await Promise.all([page.waitForNavigation({timeout:15000}).catch(()=>null), page.click('button[type=submit]')]);
await page.waitForTimeout(2500);
for (const [route, name] of [
  ['/es/os/skills', 'pop-01-skills'],
  ['/es/os/content', 'pop-02-content'],
  ['/es/os/agents', 'pop-03-agents'],
]) {
  await page.goto(`https://www.comunitymanager.io${route}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1200);
  const err = await page.locator('text="Error crítico"').count();
  const txtLen = ((await page.locator('main').textContent().catch(()=>''))||'').length;
  console.log(`${route}: err=${err} content_len=${txtLen}`);
  await page.screenshot({ path: `F:/comunity manager/community-manager-platform/web/tmp-debug/${name}.png`, fullPage: false });
}
await browser.close();
