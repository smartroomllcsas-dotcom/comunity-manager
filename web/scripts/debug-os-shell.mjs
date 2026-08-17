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
page.on('response', (r) => {
  if (r.url().includes('/api/auth/local')) {
    logs.push(`[api] ${r.status()} ${r.url()}`);
  }
});

async function shot(name) {
  const p = path.join(OUT, `${name}.png`);
  await page.screenshot({ path: p, fullPage: true });
  console.log(`SHOT ${name}`);
}

// Login via API (more reliable than form submit)
console.log('→ Login via API');
const loginResp = await page.request.post('https://www.comunitymanager.io/api/auth/local', {
  data: { action: 'login', email: 'leonelzc2005@gmail.com', password: '123456789' },
  headers: { 'Content-Type': 'application/json' },
});
console.log('  API status:', loginResp.status());
const setCookies = loginResp.headersArray().filter(h => h.name.toLowerCase() === 'set-cookie');
console.log('  Cookies set:', setCookies.length);
// Cookies auto-persist in context

// Verify cookies exist
const cookies = await context.cookies('https://www.comunitymanager.io');
console.log('  Cookies in jar:', cookies.map(c => c.name).join(', '));

// Now navigate to /es/os
const osRoutes = [
  ['/es/os', 'os-01-dashboard'],
  ['/es/os/goals', 'os-02-goals'],
  ['/es/os/social', 'os-03-social'],
  ['/es/os/integrations', 'os-04-integrations'],
];

for (const [route, name] of osRoutes) {
  console.log(`→ ${route}`);
  try {
    await page.goto(`https://www.comunitymanager.io${route}`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log(`  Warning: ${e.message.slice(0, 100)}`);
  }
  console.log(`  URL: ${page.url()}`);
  console.log(`  Title: ${await page.title()}`);
  // Check for error boundary
  const errorBoundary = await page.locator('text="Error crítico"').count();
  const bodyText = (await page.locator('body').textContent().catch(() => '')).slice(0, 200);
  console.log(`  Error boundary: ${errorBoundary}`);
  console.log(`  Body preview: ${bodyText.replace(/\s+/g,' ')}`);
  await shot(name);
}

console.log('=== ALL LOGS ===');
console.log(logs.slice(0, 30).join('\n'));

await browser.close();
console.log('DONE');
