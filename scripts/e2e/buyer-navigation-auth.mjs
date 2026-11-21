import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:5185';
const output = resolve(process.env.BUYER_NAVIGATION_AUTH_OUTPUT ?? '.artifacts/e2e/buyer-discovery/navigation-auth');
await mkdir(output, { recursive: true });

const browser = await chromium.launch();
const user = { id: 'buyer-1', email: 'buyer@example.test', fullName: 'Minh Nguyễn', role: 'AUDIENCE' };
const part = Buffer.from(JSON.stringify({ ...user, sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url');
const token = `eyJhbGciOiJIUzI1NiJ9.${part}.fixture`;
const destination = '/checkout?orderId=fixture-order#payment';

async function fixture(options, run) {
  const { authenticated = false, width = 1440, locale = 'en-US' } = options;
  const context = await browser.newContext({ baseURL, locale, viewport: { width, height: 900 } });
  if (authenticated) {
    await context.addCookies([{ url: baseURL, name: 'ticketbox_auth_token', value: token }]);
  }
  const page = await context.newPage();
  page.setDefaultTimeout(3000);
  const requests = { login: [], register: [], recovery: [] };
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url());
    const reply = (data, status = 200, message = 'OK') =>
      route.fulfill({ status, json: { code: status, data, message } });
    if (url.pathname.startsWith('/api/')) {
      switch (url.pathname) {
        case '/api/auth/me': return reply(user);
        case '/api/auth/register':
          requests.register.push(route.request().postDataJSON());
          return reply(null, 201);
        case '/api/auth/login':
          requests.login.push(route.request().postDataJSON());
          return requests.login.at(-1).password === 'password-good'
            ? reply({ user, accessToken: token })
            : reply(null, 401, 'Email or password is incorrect.');
        case '/api/auth/password-reset':
          requests.recovery.push(route.request().postDataJSON());
          return reply(null, 202);
        case '/api/notifications/unread-count': return reply({ count: 7 });
        case '/api/concerts': return reply({ content: [], totalPages: 0, totalElements: 0 });
        default: return reply(null, 404);
      }
    }
    return url.origin === new URL(baseURL).origin ? route.continue() : route.abort();
  });
  try {
    await run(page, requests);
  } finally {
    await context.close();
  }
}

async function fillRegistration(page, confirmation) {
  await page.getByLabel('Full name').fill(user.fullName);
  await page.getByLabel('Email address').fill(user.email);
  await page.getByLabel('Password', { exact: true }).fill('password-good');
  await page.getByLabel('Confirm password').fill(confirmation);
  await page.getByRole('checkbox').check();
}

async function assertFocused(locator) {
  assert(await locator.evaluate((element) => element === document.activeElement));
}

const cases = [
  ['Header search preserves active catalogue filters and mirrors reload', async () => {
    await fixture({}, async (page) => {
      await page.goto('/?status=on-sale&sort=date&date=weekend&q=previous');
      const search = page.getByRole('banner').getByRole('searchbox', { name: 'Find events' });
      await search.fill(' Hanoi ');
      await search.press('Enter');
      await page.waitForURL((url) => url.searchParams.get('q') === 'Hanoi');
      const url = new URL(page.url());
      for (const [key, value] of Object.entries({ status: 'on-sale', sort: 'date', date: 'weekend' })) {
        assert.equal(url.searchParams.get(key), value);
      }
      await page.reload();
      assert.equal(await search.inputValue(), 'Hanoi');
      await page.waitForFunction(() => document.activeElement?.id === 'discovery-results-heading');
      await search.fill('');
      await search.press('Enter');
      await page.waitForURL((value) => !value.searchParams.has('q'));
      assert.equal(new URL(page.url()).searchParams.get('status'), 'on-sale');
    });
  }],
  ['320px header offers direct wallet, mobile search and keyboard disclosures', async () => {
    await fixture({ authenticated: true, width: 320 }, async (page) => {
      await page.goto('/');
      const header = page.getByRole('banner');
      await header.getByRole('link', { name: 'My tickets' }).waitFor();
      assert(await header.getByRole('combobox', { name: 'Language' }).isVisible());
      const searchButton = header.getByRole('button', { name: 'Find events' });
      await searchButton.press('Enter');
      const search = header.getByRole('searchbox', { name: 'Find events' });
      await search.waitFor();
      await assertFocused(search);
      await search.press('Escape');
      assert.equal(await searchButton.getAttribute('aria-expanded'), 'false');
      await assertFocused(searchButton);

      const menu = header.getByRole('button', { name: 'Toggle navigation' });
      await menu.press('Enter');
      const navigation = header.getByRole('navigation', { name: 'Mobile navigation' });
      const organizer = navigation.getByRole('link', { name: 'Organizer workspace' });
      assert.equal(await organizer.getAttribute('href'), '/organizer');
      assert.equal(await navigation.getByRole('link', { name: 'Order history' }).getAttribute('href'), '/profile?tab=orders');
      await navigation.getByRole('link', { name: /Notifications.*7 unread/ }).waitFor();
      await navigation.getByRole('link', { name: 'Profile' }).focus();
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      await assertFocused(menu);
      await menu.click();
      await page.screenshot({ path: resolve(output, 'mobile-navigation-en-320.png') });
      await navigation.getByRole('link', { name: 'Order history' }).click();
      await page.waitForURL('**/profile?tab=orders');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
  }],
  ['Desktop account focus, unread badge and order history are accessible', async () => {
    await fixture({ authenticated: true }, async (page) => {
      await page.goto('/');
      const header = page.getByRole('banner');
      const main = header.getByRole('navigation', { name: 'Main navigation' });
      await main.getByRole('link', { name: /Notifications.*7 unread/ }).waitFor();
      const account = header.getByRole('button', { name: 'Open account menu' });
      await account.press('Enter');
      const orders = header.getByRole('link', { name: 'Order history' });
      await orders.focus();
      await page.keyboard.press('Escape');
      assert.equal(await account.getAttribute('aria-expanded'), 'false');
      await assertFocused(account);
      await account.click();
      await page.screenshot({ path: resolve(output, 'desktop-account-menu-en.png') });
      await orders.click();
      await page.waitForURL('**/profile?tab=orders');
      assert.equal(await account.getAttribute('aria-expanded'), 'false');
    });
  }],
  ['Register validates confirmation, allows no phone and resumes guarded checkout', async () => {
    await fixture({}, async (page, requests) => {
      await page.goto(destination);
      await page.waitForURL('**/login');
      await page.getByRole('link', { name: 'Create account' }).click();
      await page.waitForURL('**/register');
      assert.equal(await page.getByLabel('Phone number (optional)').getAttribute('required'), null);
      assert.equal(await page.locator('a[href="#terms"], a[href="#privacy"]').count(), 0);
      for (const [name, value] of [['Terms', process.env.VITE_ACCOUNT_TERMS_URL], ['Privacy policy', process.env.VITE_PRIVACY_URL]]) {
        const link = page.getByRole('link', { name, exact: true });
        if (value?.startsWith('https://')) assert.equal(await link.getAttribute('href'), new URL(value).href);
        else assert.equal(await link.count(), 0);
      }
      await fillRegistration(page, 'different-password');
      await page.getByRole('button', { name: 'Create account' }).click();
      const confirmation = page.getByLabel('Confirm password');
      await page.getByText('The passwords do not match.').waitFor();
      assert.equal(await confirmation.getAttribute('aria-invalid'), 'true');
      await assertFocused(confirmation);
      assert.equal(requests.register.length, 0);
      await confirmation.fill('password-good');
      await page.getByRole('button', { name: 'Create account' }).click();
      await page.waitForURL('**/login');
      assert.equal(requests.register.length, 1);
      assert.equal(requests.register[0].fullName, user.fullName);
      assert(!requests.register[0].phone);
      assert.equal(await page.getByLabel('Email address').inputValue(), user.email);
      await page.getByLabel('Password', { exact: true }).fill('password-wrong');
      await page.getByRole('button', { name: 'Sign in' }).click();
      const alert = page.getByRole('alert');
      await alert.getByText('Email or password is incorrect.').waitFor();
      await assertFocused(alert);
      assert.equal(await page.getByLabel('Email address').inputValue(), user.email);
      await page.getByLabel('Password', { exact: true }).fill('password-good');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL((url) => url.pathname + url.search + url.hash === destination);
      await page.getByRole('banner').waitFor({ state: 'hidden' });
      await page.getByRole('combobox', { name: 'Language' }).waitFor();
    });
  }],
  ['Recovery stays consistent and returns to the guarded sign-in', async () => {
    await fixture({}, async (page, requests) => {
      await page.goto(destination);
      await page.waitForURL('**/login');
      await page.getByRole('link', { name: 'Forgot password?' }).click();
      await page.getByLabel('Email address').fill('anyone@example.test');
      await page.getByRole('button', { name: 'Send password reset link' }).click();
      await page.getByRole('status').getByText('If the email address is eligible, TicketBox will send password reset instructions.').waitFor();
      assert.deepEqual(requests.recovery, [{ email: 'anyone@example.test' }]);
      await page.getByRole('link', { name: 'Back to sign in' }).click();
      await page.waitForURL('**/login');
      await page.getByLabel('Email address').fill(user.email);
      await page.getByLabel('Password', { exact: true }).fill('password-good');
      await page.getByRole('button', { name: 'Sign in' }).click();
      await page.waitForURL((url) => url.pathname + url.search + url.hash === destination);
    });
  }],
  ['Authentication pages reflow in Vietnamese and English', async () => {
    for (const locale of ['vi-VN', 'en-US']) {
      await fixture({ locale }, async (page) => {
        for (const path of ['/login', '/register', '/forgot-password', '/reset-password']) {
          await page.goto(path);
          await page.getByRole('heading', { level: 1 }).waitFor();
          for (const width of [320, 390, 834, 1440]) {
            await page.setViewportSize({ width, height: 900 });
            assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), `${path} ${locale} ${width}px`);
            assert(await page.getByRole('combobox').isVisible());
          }
          if (path === '/register' || path === '/login') {
            for (const width of [390, 1440]) {
              await page.setViewportSize({ width, height: 900 });
              await page.screenshot({ path: resolve(output, `${path.slice(1)}-${locale}-${width}.png`), fullPage: true });
            }
          }
        }
      });
    }
  }],
];

const failures = [];
try {
  const filters = process.argv.slice(2);
  for (const [name, run] of cases) {
    if (filters.length && !filters.some((filter) => name.includes(filter))) continue;
    try {
      await run();
      console.log(`PASS ${name}`);
    } catch (error) {
      failures.push(name);
      console.error(`FAIL ${name}`, error);
    }
  }
} finally {
  await browser.close();
}
assert.deepEqual(failures, []);
