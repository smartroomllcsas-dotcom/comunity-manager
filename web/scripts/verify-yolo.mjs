import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`[PE] ${e.message}`));
page.on('response', r => { if (r.status() >= 500) errs.push(`[${r.status()}] ${r.url()}`); });

await page.goto('https://www.comunitymanager.io/login', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'leonelzc2005@gmail.com');
await page.fill('input[type=password]', '123456789');
await Promise.all([page.waitForNavigation({timeout:15000}).catch(()=>null), page.click('button[type=submit]')]);
await page.waitForTimeout(2500);

const routes = [
  ['/dashboard', 'yolo-01-dashboard'],
  ['/es/os', 'yolo-02-console'],
  ['/es/os/agents', 'yolo-03-agents'],
  ['/es/os/goals', 'yolo-04-goals'],
  ['/es/os/comms', 'yolo-05-comms'],
  ['/es/os/tasks', 'yolo-06-tasks'],
  ['/es/os/roadmap', 'yolo-07-roadmap'],
  ['/es/os/personas', 'yolo-08-personas'],
  ['/es/os/integrations', 'yolo-09-integrations'],
];

for (const [route, name] of routes) {
  errs.length = 0;
  console.log(`\n=== ${route} ===`);
  try {
    await page.goto(`https://www.comunitymanager.io${route}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1200);
  } catch (e) { console.log('goto err:', e.message.slice(0,80)); }
  const err = await page.locator('text="Error crítico"').count();
  const has404 = await page.locator('text="404"').count();
  const url = page.url();
  console.log(`URL: ${url}`);
  console.log(`Error crítico: ${err} · 404: ${has404}`);
  if (errs.length) console.log('errs:', errs.slice(0,3).join(' | '));
  await page.screenshot({ path: `F:/comunity manager/community-manager-platform/web/tmp-debug/${name}.png`, fullPage: false });
}
await browser.close();
console.log('\nDONE');
