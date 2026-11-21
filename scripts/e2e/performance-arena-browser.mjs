import assert from 'node:assert/strict';
import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const output = process.env.E2E_REPORT_DIRECTORY ?? '.artifacts/e2e/seating';
const arena = JSON.parse(await readFile(output + '/performance-arena.json', 'utf8'));
const gateway = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18105';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(gateway).hostname), 'Use the isolated arena fixture');
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL: gateway, locale: 'en-US', viewport: { width: 1440, height: 900 } });
  const login = await context.request.post('/api/auth/login', {
    data: { email: 'audience@ticketbox.com', password: 'password123' },
  });
  assert.equal(login.status(), 200);
  await context.addCookies([{ name: 'ticketbox_auth_token', value: (await login.json()).data.accessToken, url: gateway }]);
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  await page.goto('/events/' + arena.event);
  await page.getByRole('link', { name: 'Buy tickets' }).click();
  await page.getByRole('heading', { name: 'Choose tickets' }).waitFor();
  const section = page.getByRole('combobox', { name: 'Sections', exact: true });
  const started = performance.now();
  await section.focus();
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  const seat = page.getByRole('button', { name: 'Row 1, seat 2 · Accessible seat', exact: true });
  await seat.waitFor();
  const sectionReadyMs = Math.round(performance.now() - started);
  const initialSeatElements = await page.locator('svg circle').count();
  assert.ok(initialSeatElements <= 500, initialSeatElements);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  await seat.focus();
  const accessibilityName = await seat.ariaSnapshot();
  assert.match(accessibilityName, /Row 1, seat 2/);
  if (await seat.getAttribute('aria-pressed') === 'false') await page.keyboard.press('Enter');
  await page.locator('aside button:not([disabled])').getByText('Continue to checkout').waitFor();
  await page.locator('.performance-panel-inner svg').scrollIntoViewIfNeeded();
  await page.screenshot({ path: output + '/arena-mobile.png', animations: 'disabled' });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.screenshot({ path: output + '/arena-desktop.png', animations: 'disabled' });
  const render = await page.evaluate(() => {
    const namespace = 'http://www.w3.org/2000/svg';
    const fixture = document.createElement('div');
    document.body.append(fixture);
    function measure(type, count) {
      const times = [];
      for (let sample = 0; sample < 25; sample++) {
        const started = performance.now();
        if (type === 'SVG') {
          const map = document.createElementNS(namespace, 'svg');
          for (let n = 0; n < count; n++) {
            const seat = document.createElementNS(namespace, 'circle');
            seat.setAttribute('cx', String(n % 50 * 4 + 2));
            seat.setAttribute('cy', String(Math.floor(n / 50) * 4 + 2));
            seat.setAttribute('r', '2');
            map.append(seat);
          }
          fixture.replaceChildren(map);
        } else {
          const map = document.createElement('canvas');
          const ctx = map.getContext('2d');
          for (let n = 0; n < count; n++) {
            ctx.beginPath();
            ctx.arc(n % 50 * 4 + 2, Math.floor(n / 50) * 4 + 2, 2, 0, Math.PI * 2);
            ctx.fill();
          }
          fixture.replaceChildren(map);
        }
        fixture.getBoundingClientRect();
        times.push(performance.now() - started);
      }
      return Number(times.sort((a, b) => a - b)[23].toFixed(2));
    }
    const observations = [500, 1050].map(seats => ({ seats, svgMs: measure('SVG', seats), canvasMs: measure('Canvas', seats) }));
    fixture.remove();
    return observations;
  });
  const report = { sectionReadyMs, initialSeatElements, accessibilityName, rendererMicrobenchmarkP95: render };
  await writeFile(output + '/performance-browser.json', JSON.stringify(report, null, 2) + '\n');
  console.log(report);
} finally {
  await browser.close();
}
