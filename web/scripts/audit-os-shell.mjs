import { chromium } from '@playwright/test';
const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await ctx.newPage();
const errs = [];
page.on('pageerror', e => errs.push(`[PE] ${e.message}`));
page.on('response', r => { if (r.status() >= 400) errs.push(`[${r.status()}] ${r.url()}`); });

// Login
await page.goto('https://www.comunitymanager.io/login', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'leonelzc2005@gmail.com');
await page.fill('input[type=password]', '123456789');
await Promise.all([page.waitForNavigation({timeout: 15000}).catch(()=>null), page.click('button[type=submit]')]);
await page.waitForTimeout(2000);

const routes = [
  ['/es/os', 'audit-01-console'],
  ['/es/os/agents', 'audit-02-agents'],
  ['/es/os/goals', 'audit-03-goals'],
  ['/es/os/skills', 'audit-04-skills'],
  ['/es/os/funnel', 'audit-05-funnel'],
  ['/es/os/content', 'audit-06-content'],
  ['/es/os/social', 'audit-07-social'],
  ['/es/os/workflows', 'audit-08-workflows'],
  ['/es/os/integrations', 'audit-09-integrations'],
  ['/es/os/observability', 'audit-10-observability'],
  ['/es/os/analytics', 'audit-11-analytics'],
];

for (const [route, name] of routes) {
  errs.length = 0;
  console.log(`\n=== ${route} ===`);
  try {
    await page.goto(`https://www.comunitymanager.io${route}`, { waitUntil: 'networkidle', timeout: 20000 });
    await page.waitForTimeout(1500);
  } catch (e) {
    console.log(`  goto err: ${e.message.slice(0,80)}`);
  }
  const url = page.url();
  const hasErr = await page.locator('text="Error crítico"').count();
  const has404 = await page.locator('text="404"').count();
  const hasOsShell = await page.locator('.os-shell').count();
  const bodyText = (await page.locator('body').textContent().catch(()=>'')).slice(0, 300).replace(/\s+/g,' ').trim();
  console.log(`  URL: ${url}`);
  console.log(`  err: ${hasErr} · 404: ${has404} · shell: ${hasOsShell}`);
  console.log(`  body: ${bodyText}`);
  if (errs.length) console.log(`  errors:`, errs.slice(0,3).join(' | '));
  await page.screenshot({ path: `F:/comunity manager/community-manager-platform/web/tmp-debug/${name}.png`, fullPage: true });
}

await browser.close();
console.log('\nDONE');
