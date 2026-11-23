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
  async function login(role) {
    const response = await context.request.post('/api/auth/login', {
      data: { email: `${role}@ticketbox.com`, password: 'password123' },
    });
    assert.equal(response.status(), 200);
    return (await response.json()).data;
  }
  const admin = await login('admin');
  const { user, accessToken } = await login('organizer');
  const useSession = (token) => context.addCookies([{ name: 'ticketbox_auth_token', value: token, url: baseURL }]);
  await useSession(accessToken);
  const memberships = await context.request.get('/api/organizations', { headers: { Authorization: 'Bearer ' + accessToken } });
  assert.equal(memberships.status(), 200);
  const grants = ['MEMBERS', 'FINANCE', 'EVENTS'];
  let org = (await memberships.json()).data.find((entry) => grants.every((grant) => entry.grants.includes(grant)));
  if (!org) {
    const fixture = await context.request.post('/api/admin/organizations', {
      headers: { Authorization: 'Bearer ' + admin.accessToken },
      data: { name: 'Workspace appearance fixture', initialManagerId: user.id },
    });
    assert.equal(fixture.status(), 201);
    org = (await fixture.json()).data;
  }
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

  await page.goto('/organizer/events');
  const organization = page.getByRole('combobox', { name: 'Active organization' });
  for (const width of [1151, 1200]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.getByRole('navigation', { name: 'Concert navigation' }).waitFor();
    const [organizationBox, languageBox] = await Promise.all([organization.boundingBox(), language.boundingBox()]);
    assert.ok(organizationBox && languageBox && organizationBox.x + organizationBox.width <= languageBox.x,
      `Organization and language controls overlap at ${width}px`);
  }
  await page.setViewportSize({ width: 1440, height: 1000 });

  await useSession(admin.accessToken);
  await page.goto('/admin');
  const concert = page.getByRole('button', { name: 'Concert', exact: true });
  const concertNav = page.getByRole('navigation', { name: 'Concert navigation' });
  const allConcerts = concertNav.getByRole('link', { name: 'All concerts', exact: true });
  const review = concertNav.getByRole('link', { name: 'Event review', exact: true });
  const primary = page.getByRole('navigation', { name: 'Management navigation' });
  const menu = page.getByRole('button', { name: 'Open navigation' });
  await concert.focus();
  await page.keyboard.press('Enter');
  assert.equal(await concert.getAttribute('aria-expanded'), 'true');
  const [primaryBox, secondaryBox] = await Promise.all([primary.boundingBox(), concertNav.boundingBox()]);
  assert.ok(primaryBox && secondaryBox && primaryBox.x + primaryBox.width <= secondaryBox.x);
  await page.keyboard.press('Space');
  assert.equal(await concert.getAttribute('aria-expanded'), 'false');
  assert.equal(await concertNav.isVisible(), false);
  assert.equal(await concert.evaluate((node) => document.activeElement === node), true);
  await page.keyboard.press('Space');
  await allConcerts.waitFor();
  await shell.locator('.operations-sidebar-footer button').focus();
  await page.keyboard.press('Tab');
  assert.equal(await page.getByRole('button', { name: 'Collapse Concert sidebar' })
    .evaluate((node) => document.activeElement === node), true);
  await page.keyboard.press('Tab');
  assert.equal(await allConcerts.evaluate((node) => document.activeElement === node), true);
  await review.click();
  assert.equal(await review.getAttribute('aria-current'), 'page');

  for (const width of [1024, 834, 390]) {
    await page.setViewportSize({ width, height: 1000 });
    await menu.focus();
    await menu.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Management navigation' });
    const back = dialog.getByRole('button', { name: 'Back to main navigation' });
    await back.waitFor();
    await back.press('Enter');
    assert.equal(await concert.evaluate((node) => document.activeElement === node), true);
    await concert.press('Space');
    assert.equal(await back.evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press('Tab');
    assert.equal(await allConcerts.evaluate((node) => document.activeElement === node), true);
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert.equal(await menu.evaluate((node) => document.activeElement === node), true);
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  }
  await language.press('Home');
  await language.press('Enter');
  await page.getByRole('button', { name: 'Mở điều hướng' }).click();
  await page.getByRole('navigation', { name: 'Điều hướng concert' })
    .getByRole('link', { name: 'Tất cả concert', exact: true }).waitFor();
  await page.keyboard.press('Escape');
  await vietnamese.click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1000 });
  const cdp = await context.newCDPSession(page);
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: 720, height: 500, deviceScaleFactor: 2, mobile: false, screenWidth: 1440, screenHeight: 1000,
  });
  await menu.waitFor();
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  await cdp.send('Emulation.clearDeviceMetricsOverride');

  if (output) await mkdir(output, { recursive: true });
  for (const [name, route] of [
    ['reconciliation', '/organizer/reconciliation'], ['members', '/organizer/members'],
    ['concerts', '/organizer/events'], ['performance-operations', '/admin/performance-operations'],
  ]) {
    await useSession(route.startsWith('/organizer') ? accessToken : admin.accessToken);
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
  await useSession(accessToken);
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
