import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18105';
const output = process.env.E2E_REPORT_DIRECTORY;

function contrast(first, second) {
  const intensity = (hex) => {
    const digits = hex.length === 4 ? hex.slice(1).replace(/./g, (digit) => digit + digit) : hex.slice(1);
    return [0, 2, 4].reduce((total, offset, index) => {
      const channel = Number.parseInt(digits.slice(offset, offset + 2), 16) / 255;
      const linear = channel <= .04045 ? channel / 12.92 : ((channel + .055) / 1.055) ** 2.4;
      return total + linear * [.2126, .7152, .0722][index];
    }, 0);
  };
  const [lighter, darker] = [intensity(first), intensity(second)].sort((a, b) => b - a);
  return (lighter + .05) / (darker + .05);
}

async function verifyPalette(shell) {
  const values = await shell.evaluate((element) => {
    const style = getComputedStyle(element);
    return Object.fromEntries(['--cream', '--muted', '--surface', '--surface-2', '--ink', '--coral', '--ops-primary-text']
      .map((token) => [token, style.getPropertyValue(token).trim()]));
  });
  for (const surface of ['--ink', '--surface', '--surface-2']) {
    assert.ok(contrast(values['--cream'], values[surface]) >= 4.5);
    assert.ok(contrast(values['--muted'], values[surface]) >= 4.5);
  }
  assert.ok(contrast(values['--ops-primary-text'], values['--coral']) >= 4.5);
}
const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    baseURL, colorScheme: 'light', locale: 'en-US', reducedMotion: 'reduce', viewport: { width: 2560, height: 1080 },
  });
  const login = await context.request.post('/api/auth/login', {
    data: { email: 'admin@ticketbox.com', password: 'password123' },
  });
  assert.equal(login.status(), 200);
  const { user, accessToken } = (await login.json()).data;
  await context.addCookies([{ name: 'ticketbox_auth_token', value: accessToken, url: baseURL }]);
  const memberships = await context.request.get('/api/organizations', { headers: { Authorization: 'Bearer ' + accessToken } });
  assert.equal(memberships.status(), 200);
  const org = (await memberships.json()).data.find((entry) => entry.grants.includes('MEMBERS') && entry.grants.includes('FINANCE'));
  assert.ok(org, 'The local test administrator needs an organization with Members and Finance grants');
  const page = await context.newPage();
  page.setDefaultTimeout(7000);
  await page.addInitScript(({ user, org }) => sessionStorage.setItem('ticketbox.organization.' + user, org),
    { user: user.id, org: org.id });
  await page.goto('/organizer/reconciliation');
  const shell = page.locator('.operations-shell');
  const light = page.getByRole('button', { name: 'Switch to light mode' });
  await page.getByRole('button', { name: 'Switch to dark mode' }).click();
  assert.equal(await shell.getAttribute('data-theme'), 'dark');
  await light.waitFor();
  await verifyPalette(shell);
  await page.reload();
  await light.waitFor();
  assert.equal(await shell.getAttribute('data-theme'), 'dark');

  const desktop = await shell.evaluate((element) => {
    const content = element.querySelector('.operations-content');
    const main = element.querySelector('.operations-main');
    return { unused: main.clientWidth - content.clientWidth, fontSize: Number.parseFloat(getComputedStyle(content).fontSize) };
  });
  assert.ok(desktop.unused <= 80, 'The workspace should use the available width beside the sidebar');
  assert.ok(desktop.fontSize >= 15, 'Workspace text should have a legible base size');

  const language = page.getByRole('combobox', { name: 'Language' });
  assert.notEqual(await language.evaluate((node) => node.tagName), 'SELECT');
  await language.focus();
  await language.press('Home');
  await page.getByRole('option', { name: 'Tiếng Việt', exact: true }).waitFor();
  await language.press('Escape');
  assert.equal(await language.getAttribute('aria-expanded'), 'false');
  await language.press('Home');
  await language.press('Enter');
  const vietnamese = page.getByRole('combobox', { name: 'Ngôn ngữ' });
  await vietnamese.waitFor();
  await vietnamese.click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await language.waitFor();

  if (output) await mkdir(output, { recursive: true });
  for (const [name, route] of [
    ['reconciliation', '/organizer/reconciliation'], ['members', '/organizer/members'],
    ['concerts', '/organizer/events'], ['performance-operations', '/admin/performance-operations'],
  ]) {
    await page.goto(route);
    await shell.getByRole('heading', { level: 1 }).waitFor();
    assert.equal(await shell.getAttribute('data-theme'), 'dark');
    for (const width of [2560, 834, 390]) {
      await page.setViewportSize({ width, height: 1000 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${name} at ${width}px`);
      if (route.startsWith('/organizer')) await page.getByRole('combobox', { name: 'Active organization' }).waitFor();
      if (output) await page.screenshot({ path: `${output}/${name}-dark-${width}.png`, animations: 'disabled', fullPage: true });
    }
  }
  await light.click();
  assert.equal(await shell.getAttribute('data-theme'), 'light');
  await verifyPalette(shell);
  await page.goto('/organizer/reconciliation');
  assert.equal(await shell.getAttribute('data-theme'), 'light');
  if (output) {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.screenshot({ path: `${output}/reconciliation-light-1440.png`, animations: 'disabled', fullPage: true });
  }
  console.log('Workspace width, keyboard dropdown behavior, responsive pages and theme persistence passed.');
} finally {
  await browser.close();
}
