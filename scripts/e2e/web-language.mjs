import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_LANGUAGE_URL ?? 'http://localhost:5184';
const browser = await chromium.launch();

try {
  const context = await browser.newContext({ baseURL, locale: 'en-US' });
  const page = await context.newPage();
  let releaseResponse;
  let requestLanguage;
  const requested = new Promise((resolve) => {
    page.route('**/api/auth/login', async (route) => {
      requestLanguage = route.request().headers()['accept-language'];
      await new Promise((release) => { releaseResponse = release; resolve(); });
      await route.fulfill({ status: 400, json: { code: 400, message: 'Previous language response' } });
    });
  });
  await page.goto('/login');
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  const language = page.locator('select[data-language-select]');
  await language.waitFor({ timeout: 4000 });
  await page.locator('input[name=email]').fill('test@example.com');
  await page.locator('input[name=password]').fill('invalid-password');
  await page.locator('button[type=submit]').click();
  await requested;
  assert.equal(requestLanguage, 'en');
  await language.selectOption('vi');
  assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
  assert.equal(await page.locator('input[name=email]').inputValue(), 'test@example.com');
  releaseResponse();
  await page.getByRole('alert').waitFor();
  assert.doesNotMatch(await page.getByRole('alert').textContent(), /Previous language response/);
  await page.reload();
  assert.equal(await page.locator('html').getAttribute('lang'), 'vi');
  assert.equal(await language.inputValue(), 'vi');
  await context.close();

  const unsupported = await browser.newContext({ baseURL, locale: 'fr-FR' });
  const publicPage = await unsupported.newPage();
  let publicLanguage;
  const publicConcerts = (url) => url.pathname === '/api/concerts';
  await publicPage.route(publicConcerts, (route) => {
    publicLanguage = route.request().headers()['accept-language'];
    return route.fulfill({ json: { code: 200, data: { content: [], totalPages: 0 } } });
  });
  const concerts = publicPage.waitForResponse((response) => publicConcerts(new URL(response.url())));
  await publicPage.goto('/');
  await concerts;
  assert.equal(await publicPage.locator('html').getAttribute('lang'), 'vi');
  assert.equal(publicLanguage, 'vi');
  await unsupported.close();

  const privateBrowser = await browser.newContext({ baseURL, locale: 'en-US' });
  await privateBrowser.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', {
      get() { throw new DOMException('Storage disabled', 'SecurityError'); },
    });
  });
  const privatePage = await privateBrowser.newPage();
  await privatePage.goto('/forgot-password');
  await privatePage.getByRole('heading', { name: 'Reset your password' }).waitFor();
  await privatePage.getByRole('combobox', { name: 'Language' }).selectOption('vi');
  await privatePage.getByRole('heading', { name: 'Đặt lại mật khẩu' }).waitFor();
  await privateBrowser.close();

  const bilingual = await browser.newContext({ baseURL, locale: 'en-US' });
  const bilingualPage = await bilingual.newPage();
  const concert = {
    id: 'bilingual-concert',
    title: 'Đêm nhạc mùa hè',
    description: 'Mô tả duy nhất',
    venueName: 'TicketBox',
    venueAddress: 'Main Street',
    eventDate: '2027-04-25T10:00:00Z',
    saleStartAt: '2027-01-01T10:00:00Z',
    status: 'ON_SALE',
    ticketTypes: [],
    translations: {
      vi: { title: 'Đêm nhạc mùa hè', description: 'Mô tả duy nhất' },
      en: { title: 'Summer show', description: null },
    },
  };
  let detailReads = 0;
  await bilingualPage.route(publicConcerts, (route) =>
    route.fulfill({ json: { code: 200, data: { content: [], totalPages: 0 } } }));
  await bilingualPage.route('**/api/concerts/bilingual-concert', (route) => {
    detailReads++;
    return route.fulfill({ json: { code: 200, data: concert } });
  });
  await bilingualPage.route('**/bilingual-concert/ticket-types', (route) =>
    route.fulfill({ json: { code: 200, data: [] } }));
  await bilingualPage.goto('/concerts/bilingual-concert');
  await bilingualPage.getByRole('heading', { name: 'Summer show', exact: true }).waitFor({ timeout: 4000 });
  await bilingualPage.getByText('Mô tả duy nhất', { exact: true }).waitFor();
  const reads = detailReads;
  await bilingualPage.locator('select[data-language-select]').selectOption('vi');
  await bilingualPage.getByRole('heading', { name: 'Đêm nhạc mùa hè', exact: true }).waitFor();
  assert.equal(detailReads, reads);
  for (const width of [390, 834, 1440]) {
    await bilingualPage.setViewportSize({ width, height: 900 });
    assert(await bilingualPage.locator('select[data-language-select]').isVisible());
    assert(await bilingualPage.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }
  await bilingual.close();
  console.log('Web language selection, persistence and HTTP feedback passed');
} finally {
  await browser.close();
}
