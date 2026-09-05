import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'F:/comunity manager/community-manager-platform/web/tmp-debug';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));

async function shot(name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`SHOT ${name}`);
}

// Login via form (worked before with 12345678)
console.log('→ Login form flow');
await page.goto('https://www.comunitymanager.io/login', { waitUntil: 'networkidle' });
await page.fill('input[type=email]', 'leonelzc2005@gmail.com');
await page.fill('input[type=password]', '123456789');
await Promise.all([
  page.waitForNavigation({ timeout: 15000 }).catch(() => null),
  page.click('button[type=submit]'),
]);
await page.waitForTimeout(3000);
console.log('  Post-login URL:', page.url());

// If still on login, try direct navigation to /dashboard
if (page.url().includes('/login')) {
  console.log('→ Going to /dashboard directly');
  await page.goto('https://www.comunitymanager.io/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  console.log('  URL:', page.url());
}

await shot('click-01-post-login');

// Check if we're logged in (URL is not login)
if (!page.url().includes('/login')) {
  // Go to dashboard first to see sidebar
  console.log('→ Go /dashboard');
  await page.goto('https://www.comunitymanager.io/dashboard', { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  // Click Community OS link
  console.log('→ Expand sidebar');
  await page.click('button[aria-label="Expandir menú"]', { timeout: 5000 }).catch(() => {});
  await page.waitForTimeout(500);
  await shot('click-02-sidebar-expanded');

  console.log('→ Click Community OS link');
  await page.click('a[href="/es/os"]', { timeout: 5000 });
  await page.waitForTimeout(4000);
  console.log('  URL after click:', page.url());
  console.log('  Title:', await page.title());

  const hasError = await page.locator('text="Error crítico"').count();
  const has404 = await page.locator('text="404"').count();
  const hasConsole = await page.locator('text="Console"').count();
  const hasOsShell = await page.locator('.os-shell').count();
  console.log(`  Error crítico: ${hasError}, 404: ${has404}, Console text: ${hasConsole}, .os-shell: ${hasOsShell}`);

  await shot('click-03-os-page');
}

await browser.close();
console.log('DONE');
