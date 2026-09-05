import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';

const OUT = 'F:/comunity manager/community-manager-platform/web/tmp-debug';
await mkdir(OUT, { recursive: true });

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const logs = [];
page.on('console', (m) => logs.push(`[${m.type()}] ${m.text()}`));
page.on('pageerror', (e) => logs.push(`[pageerror] ${e.message}`));
page.on('requestfailed', (r) => logs.push(`[reqfailed] ${r.url()} ${r.failure()?.errorText}`));

async function shot(name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`SHOT ${name} → ${p}`);
}

console.log('→ /login');
await page.goto('https://www.comunitymanager.io/login', { waitUntil: 'networkidle', timeout: 30000 });
await shot('01-login');

console.log('→ fill form');
// Try common selectors
const emailSel = 'input[type=email], input[name=email], input[placeholder*="orreo" i], input[placeholder*="mail" i]';
const passSel  = 'input[type=password], input[name=password]';
await page.waitForSelector(emailSel, { timeout: 10000 });
await page.fill(emailSel, 'leonelzc2005@gmail.com');
await page.fill(passSel, '12345678');
await shot('02-filled');

console.log('→ submit');
await Promise.all([
  page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {}),
  page.click('button[type=submit], button:has-text("Iniciar"), button:has-text("Ingresar"), button:has-text("Entrar")'),
]);
await page.waitForTimeout(3000);
console.log('URL after login:', page.url());
await shot('03-after-login');

// Force nav to /dashboard
console.log('→ /dashboard');
await page.goto('https://www.comunitymanager.io/dashboard', { waitUntil: 'networkidle', timeout: 30000 });
await page.waitForTimeout(2000);
console.log('URL:', page.url());
await shot('04-dashboard');

// Check for Community OS
const hasCOsText = await page.locator('text="Community OS"').count();
const hasCOsClass = await page.locator('.nav-item-community-os').count();
const hasCOsLink = await page.locator('a[href="/es/os"]').count();
const asideHTML = await page.locator('aside').first().innerHTML().catch(() => 'no aside');

console.log('=== DIAGNOSIS ===');
console.log('Community OS text count:', hasCOsText);
console.log('nav-item-community-os class count:', hasCOsClass);
console.log('a[href=/es/os] count:', hasCOsLink);
console.log('aside HTML length:', asideHTML.length);
console.log('aside HTML preview:', asideHTML.slice(0, 400).replace(/\s+/g, ' '));

// Expand sidebar
try {
  await page.click('button[aria-label="Expandir menú"]', { timeout: 3000 });
  await page.waitForTimeout(500);
  await shot('05-sidebar-expanded');
} catch (e) {
  console.log('Could not expand sidebar:', e.message);
}

console.log('=== CONSOLE LOGS ===');
console.log(logs.slice(0, 30).join('\n'));

await browser.close();
console.log('DONE');
