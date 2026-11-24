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
        case '/api/concerts':
        case '/api/v2/events':
        case '/api/v2/events/discovery':
          return reply({ content: [], number: 0, size: 24, last: true, totalPages: 0, totalElements: 0 });
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
  ['Header search opens the catalogue, preserves active filters and mirrors reload', async () => {
    await fixture({}, async (page) => {
      await page.goto('/');
      const search = page.getByRole('banner').getByRole('combobox', { name: 'Find events' });
      await search.fill(' Hanoi ');
      await search.press('Enter');
      await page.waitForURL((url) => url.searchParams.get('q') === 'Hanoi');
      assert.equal(new URL(page.url()).pathname, '/events', 'Homepage header search opens the catalogue.');
      assert.equal(new URL(page.url()).hash, '#discover-concerts');

      await page.goto('/events?status=on-sale&sort=date&date=weekend&q=previous');
      await search.fill(' Hanoi ');
      await search.press('Enter');
      await page.waitForURL((url) => url.pathname === '/events' && url.searchParams.get('q') === 'Hanoi');
      const url = new URL(page.url());
      for (const [key, value] of Object.entries({ status: 'on-sale', sort: 'date', date: 'weekend' })) {
        assert.equal(url.searchParams.get(key), value);
      }
      await page.reload();
      assert.equal(await search.inputValue(), 'Hanoi');
      await page.waitForFunction(() => document.activeElement?.id === 'discovery-results-heading');
      await search.fill('');
      await search.press('Enter');
      await page.waitForURL((value) => value.pathname === '/events' && !value.searchParams.has('q'));
      assert.equal(new URL(page.url()).searchParams.get('status'), 'on-sale');
    });
  }],
  ['Header stays aligned through catalogue, wallet and profile navigation', async () => {
    for (const width of [1920, 320]) {
      await fixture({ authenticated: true, width }, async (page) => {
        await page.goto('/');
        const header = page.getByRole('banner');
        const logo = header.getByRole('link', { name: 'Back to events' });
        const search = header.getByRole('combobox', { name: 'Find events' });
        const searchButton = header.getByRole('button', { name: 'Find events' });
        const wallet = header.getByRole('link', { name: 'My tickets' });
        const account = header.getByRole('button', { name: 'Open account menu' });
        await wallet.waitFor();
        assert(await logo.locator('.logo-mark').isVisible(), 'The TicketBox mark stays visible on the buyer header.');
        await page.evaluate(() => document.fonts.ready);
        const controls = Object.entries({ logo, wallet, account, search: width === 320 ? searchButton : search });
        const positions = await Promise.all(controls.map(([, control]) => control.boundingBox()));
        async function assertAligned(path) {
          for (const [index, [name, control]] of controls.entries()) {
            const before = positions[index];
            await control.waitFor();
            const after = await control.boundingBox();
            assert(before && after && ['x', 'y', 'width'].every((key) => Math.abs(after[key] - before[key]) <= 1),
              `Header ${name} stays aligned on ${path} at ${width}px.`);
          }
        }

        await wallet.click();
        await page.waitForURL('**/my-tickets');
        await page.getByRole('heading', { name: 'My tickets' }).waitFor();
        await assertAligned('/my-tickets');
        await account.click();
        await header.getByRole('link', { name: 'Profile' }).click();
        await page.waitForURL('**/profile');
        await page.getByRole('heading', { level: 1 }).waitFor();
        await assertAligned('/profile');
        if (width === 320) await searchButton.click();
        await search.fill('Jazz');
        await search.press('Enter');
        await page.waitForURL('**/events?q=Jazz#discover-concerts');
        await assertAligned('/events');
      });
    }
  }],
  ['320px header offers direct wallet, mobile search and keyboard disclosures', async () => {
    await fixture({ authenticated: true, width: 320 }, async (page) => {
      await page.goto('/');
      const header = page.getByRole('banner');
      await header.getByRole('link', { name: 'My tickets' }).waitFor();
      const searchButton = header.getByRole('button', { name: 'Find events' });
      await searchButton.press('Enter');
      const search = header.getByRole('combobox', { name: 'Find events' });
      await search.waitFor();
      await assertFocused(search);
      await search.press('Escape');
      assert.equal(await searchButton.getAttribute('aria-expanded'), 'false');
      await assertFocused(searchButton);
      await searchButton.press('Enter');
      await search.fill('Danang');
      await search.press('Enter');
      await page.waitForURL((url) => url.searchParams.get('q') === 'Danang');
      assert.equal(new URL(page.url()).pathname, '/events', 'Mobile header search opens the catalogue.');
      assert.equal(await searchButton.getAttribute('aria-expanded'), 'false');

      const menu = header.getByRole('button', { name: 'Open account menu' });
      await menu.press('Enter');
      assert.equal(await header.getByRole('link', { name: 'Organizer workspace' }).count(), 0);
      assert.equal(await header.getByRole('link', { name: 'Events', exact: true }).count(), 0);
      assert.equal(await header.getByRole('link', { name: 'Order history' }).getAttribute('href'), '/profile?tab=orders');
      await header.getByRole('link', { name: /Notifications.*7 unread/ }).waitFor();
      await header.getByRole('combobox', { name: 'Language' }).waitFor();
      await header.getByRole('link', { name: 'Profile' }).focus();
      await page.keyboard.press('Escape');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      await assertFocused(menu);
      await menu.click();
      await page.screenshot({ path: resolve(output, 'mobile-navigation-en-320.png') });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
      await header.getByRole('link', { name: 'Order history' }).click();
      await page.waitForURL('**/profile?tab=orders');
      assert.equal(await menu.getAttribute('aria-expanded'), 'false');
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    });
  }],
  ['Desktop header offers language and theme; account holds notifications and order history', async () => {
    await fixture({ authenticated: true }, async (page) => {
      await page.goto('/');
      const header = page.getByRole('banner');
      const main = header.getByRole('navigation', { name: 'Main navigation' });
      await main.getByRole('link', { name: 'My tickets' }).waitFor();
      assert.equal(await main.getByRole('link', { name: 'Events', exact: true }).count(), 0, 'Events is available through catalogue search.');
      assert.equal(await header.getByRole('link', { name: /Notifications/ }).count(), 0, 'Notifications stays in the closed account menu.');
      const language = header.getByRole('combobox', { name: 'Language' });
      assert(await language.isVisible(), 'Language is reachable directly in the desktop header.');
      const theme = header.getByRole('button', { name: 'Switch to dark mode' });
      await theme.click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'dark');
      await page.reload();
      await header.getByRole('button', { name: 'Switch to light mode' }).click();
      await page.waitForFunction(() => document.documentElement.dataset.theme === 'light');
      const account = header.getByRole('button', { name: 'Open account menu' });
      await account.getByText('7 unread notifications', { exact: true }).waitFor();
      assert(await account.getAttribute('aria-describedby'));
      await account.press('Enter');
      const notifications = header.getByRole('link', { name: /Notifications.*7 unread/ });
      await notifications.waitFor();
      assert.equal(await notifications.getAttribute('href'), '/notifications');
      assert.equal(await language.count(), 1, 'The account menu does not repeat the desktop language control.');
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
      await account.click();
      await language.selectOption('vi');
      await page.waitForFunction(() => document.documentElement.lang === 'vi');
    });
  }],
  ['Guest account menu offers sign-in and a persistent language choice', async () => {
    for (const width of [320, 1440]) {
      await fixture({ width }, async (page) => {
        await page.goto('/');
        const header = page.getByRole('banner');
        const account = header.getByRole('button', { name: 'Open account menu' });
        await account.click();
        assert.equal(await header.getByRole('link', { name: 'Sign in' }).getAttribute('href'), '/login');
        assert.equal(await header.getByRole('link', { name: 'Create account' }).getAttribute('href'), '/register');
        assert.equal(await header.getByRole('link', { name: /Notifications/ }).count(), 0);
        await header.getByRole('combobox', { name: 'Language' }).selectOption('vi');
        await page.waitForFunction(() => document.documentElement.lang === 'vi');
        await page.reload();
        await header.getByRole('button', { name: 'Mở menu tài khoản' }).click();
        assert.equal(await header.getByRole('combobox', { name: 'Ngôn ngữ' }).inputValue(), 'vi');
        await header.getByRole('link', { name: 'Đăng nhập' }).click();
        await page.waitForURL('**/login');
      });
    }
  }],
  ['3-part search sends place and dates, offers recent searches and the browse row marks the view', async () => {
    await fixture({ authenticated: true }, async (page) => {
      await page.goto('/');
      const header = page.getByRole('banner');
      const where = header.getByRole('textbox', { name: 'Where: city or venue' });
      const what = header.getByRole('combobox', { name: 'Find events' });
      await where.fill('Hà Nội');
      await what.fill('jazz');
      await header.getByRole('button', { name: 'When: Any date' }).click();
      await header.getByRole('radio', { name: 'Choose dates' }).check();
      await header.getByLabel('From date').fill('2027-01-10');
      await header.getByLabel('To date').fill('2027-01-12');
      await header.getByRole('button', { name: 'Done' }).click();
      await assertFocused(header.getByRole('button', { name: /^When: / }));
      await header.getByRole('button', { name: 'Search', exact: true }).click();
      await page.waitForURL((url) => url.searchParams.get('q') === 'jazz Hà Nội');
      const url = new URL(page.url());
      assert.equal(url.pathname, '/events');
      assert.deepEqual(['date', 'from', 'to'].map((key) => url.searchParams.get(key)), ['custom', '2027-01-10', '2027-01-12']);
      await page.reload();
      assert.equal(await what.inputValue(), 'jazz');
      assert.equal(await where.inputValue(), 'Hà Nội');

      await page.goto('/');
      await what.focus();
      const recent = header.getByRole('option', { name: 'jazz · Hà Nội' });
      await recent.waitFor();
      await what.press('ArrowDown');
      assert.equal(await what.getAttribute('aria-activedescendant'), await recent.getAttribute('id'));
      await what.press('Escape');
      assert.equal(await what.getAttribute('aria-expanded'), 'false');
      await what.press('ArrowDown');
      await what.press('Enter');
      await page.waitForURL((value) => value.searchParams.get('q') === 'jazz Hà Nội');

      const browse = header.getByRole('navigation', { name: 'Browse events' });
      await browse.getByRole('link', { name: 'On sale now' }).click();
      await page.waitForURL((value) => value.pathname === '/events' && value.searchParams.get('status') === 'on-sale');
      assert.equal(await browse.getByRole('link', { name: 'On sale now' }).getAttribute('aria-current'), 'page');
      assert.equal(await browse.getByRole('link', { name: 'All events' }).getAttribute('aria-current'), null);
    });
  }],
  ['Unknown addresses show a not-found page instead of redirecting', async () => {
    for (const width of [320, 1440]) {
      await fixture({ width }, async (page) => {
        await page.goto('/no-such/page?from=email');
        const heading = page.getByRole('heading', { level: 1, name: 'We can’t find that page' });
        await heading.waitFor();
        await assertFocused(heading);
        assert.equal(new URL(page.url()).pathname, '/no-such/page');
        assert.equal(await page.getByRole('main').getByRole('link', { name: 'Browse events' }).getAttribute('href'), '/events');
        await page.getByRole('banner').waitFor();
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
        await page.screenshot({ path: resolve(output, `not-found-en-${width}.png`) });
      });
    }
  }],
  ['Legacy and native purchase routes keep the compact language header', async () => {
    await fixture({ authenticated: true, width: 390 }, async (page) => {
      await page.addInitScript(() => {
        const [, concertId] = location.pathname.match(/\/([^/]+)\/tickets$/) ?? [];
        if (concertId) sessionStorage.setItem('ticketbox.queue-admission', JSON.stringify({
          concertId, queueAccessToken: 'fixture-admission', sessionExpiresAt: new Date(Date.now() + 60_000).toISOString(),
        }));
      });
      for (const path of [
        '/concerts/legacy/waiting-room', '/events/legacy/tickets',
        '/events/native/performances/show/waiting-room', '/events/native/performances/show/tickets',
      ]) {
        await page.goto(path);
        await page.getByRole('combobox', { name: 'Language' }).waitFor();
        assert(await page.getByRole('button', { name: 'Switch to dark mode' }).isVisible(), `${path} keeps the theme choice.`);
        assert.equal(new URL(page.url()).pathname, path);
        assert.equal(await page.getByRole('banner').count(), 0, `${path} omits full buyer navigation.`);
      }
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
