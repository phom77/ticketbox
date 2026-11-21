import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18105';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname));
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ baseURL, locale: 'en-US' });
  const response = await context.request.post('/api/auth/login', {
    data: { email: 'admin@ticketbox.com', password: 'password123' },
  });
  assert.equal(response.status(), 200);
  const { accessToken } = (await response.json()).data;
  await context.addCookies([{ name: 'ticketbox_auth_token', value: accessToken, url: baseURL }]);

  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  await page.goto('/admin/performance-operations');
  const trigger = page.getByRole('combobox', { name: 'Language' });
  const popup = page.getByRole('listbox', { name: 'Language' });
  await trigger.focus();
  await trigger.press('ArrowDown');
  await popup.waitFor();
  assert.equal(await trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(await popup.getByRole('option', { name: 'English' }).getAttribute('aria-selected'), 'true');

  await trigger.press('Home');
  await trigger.press('Escape');
  assert.equal(await trigger.getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.ok(await trigger.evaluate((element) => document.activeElement === element));

  await trigger.press('ArrowDown');
  await trigger.press('t');
  await trigger.press('Enter');
  await page.getByRole('combobox', { name: 'Ngôn ngữ' }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'vi');

  for (const width of [390, 834, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    const vietnameseTrigger = page.getByRole('combobox', { name: 'Ngôn ngữ' });
    await vietnameseTrigger.click();
    const choices = page.getByRole('listbox', { name: 'Ngôn ngữ' });
    const bounds = await choices.boundingBox();
    assert.ok(bounds && bounds.x >= 0 && bounds.x + bounds.width <= width);
    await page.mouse.click(width - 16, 875);
    await choices.waitFor({ state: 'hidden' });
  }
  await page.getByRole('combobox', { name: 'Ngôn ngữ' }).click();
  await page.getByRole('option', { name: 'English', exact: true }).click();
  await trigger.waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  console.log('Workspace picker supports keyboard selection, dismissal, pointer input and responsive placement.');
} finally {
  await browser.close();
}
