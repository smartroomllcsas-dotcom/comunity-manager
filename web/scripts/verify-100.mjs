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
  ['/es/os/finances', '100-finances'],
  ['/es/os/org', '100-org'],
  ['/es/os/reference', '100-reference'],
  ['/es/os', '100-console-full-sidebar'],
]) {
  await page.goto(`https://www.comunitymanager.io${route}`, { waitUntil: 'networkidle', timeout: 20000 });
  await page.waitForTimeout(1200);
  const err = await page.locator('text="Error crítico"').count();
  const has404 = await page.locator('text="404"').count();
  console.log(`${route}: err=${err} 404=${has404} url=${page.url()}`);
  await page.screenshot({ path: `F:/comunity manager/community-manager-platform/web/tmp-debug/${name}.png`, fullPage: false });
}
await browser.close();
