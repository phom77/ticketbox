import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_BUYER_URL ?? 'http://localhost:5185';
const screenshots = process.env.TICKETBOX_BUYER_SCREENSHOTS;
const buyer = { id: 'inbox-buyer', email: 'inbox@example.test', fullName: 'Inbox Buyer', role: 'AUDIENCE' };
const secondBuyer = { ...buyer, id: 'second-buyer', email: 'second@example.test', fullName: 'Second Buyer' };
const tokenFor = (user) => 'eyJhbGciOiJIUzI1NiJ9.' +
  Buffer.from(JSON.stringify({ ...user, sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url') +
  '.fixture';
const initialToken = tokenFor(buyer);
const secondToken = tokenFor(secondBuyer);

function notification(id, eventType, subject, day, overrides = {}) {
  return {
    id,
    eventType,
    subject,
    body: 'Nội dung đã lưu cho ' + subject,
    channel: 'APP',
    createdAt: '2026-11-' + day + 'T12:00:00Z',
    read: false,
    readAt: null,
    status: 'SENT',
    sentAt: null,
    ...overrides,
  };
}

const payment = notification('payment', 'PAYMENT_SUCCEEDED', 'Vé Đêm nhạc đã sẵn sàng', '15');
const cancellation = notification('cancellation', 'EVENT_CANCELLED', 'Buổi diễn đã hủy', '14');
const reminder = notification('reminder', 'CONCERT_REMINDER', 'Nhắc lịch cuối tuần', '13');
const refund = notification('refund', 'ORDER_REFUNDED', 'Đã ghi nhận khoản hoàn', '12');
const postponed = notification('postponed', 'EVENT_POSTPONED', 'Buổi diễn đã dời lịch', '10');
const unknown = notification(
  'unknown',
  'FIXTURE_FUTURE_TYPE',
  'Thông tin từ ban tổ chức về địa điểm và thời gian mở cửa chương trình cuối tuần',
  '08',
);
const email = { ...payment, id: 'payment-email', channel: 'EMAIL' };
const newAccountNotice = notification('second-payment', 'PAYMENT_SUCCEEDED', 'Second account ticket', '12');
const pageData = (number, content, last = false) => ({
  number, content, last, first: number === 0, size: 50, totalPages: last ? number + 1 : number + 2,
  totalElements: content.length, empty: content.length === 0,
});

function deferred() {
  let resolve;
  const promise = new Promise((finish) => { resolve = finish; });
  return { promise, resolve };
}

async function fixture(browser) {
  const context = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'ticketbox_auth_token', value: initialToken, url: baseURL }]);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  page.setDefaultNavigationTimeout(15000);
  await page.route((url) => url.origin !== new URL(baseURL).origin, (route) => route.abort());
  const state = {
    counts: { [buyer.id]: 6, [secondBuyer.id]: 1 },
    countStatus: 200,
    marked: new Set(),
    list: async (number, account) => {
      if (account === secondBuyer) return pageData(0, [newAccountNotice], true);
      const pages = [
        [payment, email, cancellation],
        [{ ...email, id: 'only-email' }],
        [cancellation, reminder, refund, postponed, unknown],
      ];
      return pageData(number, pages[number].map((item) =>
        state.marked.has(item.id) ? { ...item, read: true, readAt: item.createdAt } : item), number === 2);
    },
    patch: async (id, account) => {
      const item = [payment, cancellation].find((notice) => notice.id === id);
      assert(item, 'unexpected notification marked read: ' + id);
      state.marked.add(id);
      state.counts[account.id]--;
      return { ...item, read: true, readAt: item.createdAt };
    },
  };
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const account = request.headers().authorization === 'Bearer ' + secondToken ? secondBuyer : buyer;
    const reply = (data, status = 200) => route.fulfill({ status, json: { code: status, data, message: 'Fixture' } });
    const path = url.pathname;
    if (path === '/api/auth/me') return reply(account);
    if (path === '/api/auth/login') return reply({ accessToken: secondToken, user: secondBuyer });
    if (path === '/api/notifications/unread-count') return reply({ count: state.counts[account.id] }, state.countStatus);
    if (path === '/api/notifications') {
      const result = await state.list(Number(url.searchParams.get('page')), account);
      return typeof result === 'number' ? reply(null, result) : reply(result);
    }
    if (path.startsWith('/api/notifications/') && request.method() === 'PATCH') {
      const result = await state.patch(path.split('/')[3], account);
      return typeof result === 'number' ? reply(null, result) : reply(result);
    }
    return reply(['/api/concerts', '/api/v2/events/discovery'].includes(path) ? pageData(0, [], true) : []);
  });
  return { page, state, close: () => context.close() };
}

const notice = (page, item) => page.getByRole('article').filter({ has: page.getByRole('heading', { name: item.subject, exact: true }) });
const accountMenu = (page) => page.getByRole('button', { name: /^(Open account menu|Mở menu tài khoản)$/ });
const unreadBadge = (page, count) => accountMenu(page).getByText(
  count + (count === 1 ? ' unread notification' : ' unread notifications'), { exact: true },
);
const notificationsLink = (page) => page.getByRole('banner').getByRole('link', { name: /^Notifications/ });

async function checkLayout(page, language) {
  for (const width of [320, 390, 834, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), language + ' inbox overflows at ' + width + ' px');
    if (screenshots) await page.screenshot({ path: join(screenshots, 'notifications-' + language + '-' + width + '.png') });
  }
}

const browser = await chromium.launch();
try {
  if (screenshots) await mkdir(screenshots, { recursive: true });
  const inbox = await fixture(browser);
  const { page, state } = inbox;
  await page.goto('/notifications', { waitUntil: 'domcontentloaded' });
  await page.getByRole('heading', { name: payment.subject, exact: true }).first().waitFor();
  assert.equal(await page.getByRole('heading', { name: payment.subject, exact: true }).count(), 1, 'APP and EMAIL counterparts must appear once');
  assert.equal(await page.getByText('Email was created.').count(), 0);
  assert.equal(await notice(page, payment).getByRole('link', { name: 'My Tickets' }).getAttribute('href'), '/my-tickets');
  assert.equal(await notice(page, cancellation).getByRole('link', { name: 'Order history' }).getAttribute('href'), '/profile?tab=orders');
  await unreadBadge(page, 6).waitFor();
  await page.getByRole('button', { name: 'Load older notifications' }).click();
  await page.getByRole('button', { name: 'Load older notifications' }).waitFor();
  assert.equal(await page.getByRole('article').count(), 2);
  const originalList = state.list;
  state.list = async (number, account) => number === 2 ? 503 : originalList(number, account);
  await page.getByRole('button', { name: 'Load older notifications' }).click();
  await page.getByRole('alert').getByText('Could not load older notifications.').waitFor();
  assert.equal(await page.getByRole('article').count(), 2);
  state.list = originalList;
  const retryOlder = page.getByRole('button', { name: 'Try again' });
  assert(await retryOlder.evaluate((button) => document.activeElement === button), 'Failed loading must keep focus on the older-page retry');
  await page.keyboard.press('Enter');
  await notice(page, unknown).waitFor();
  assert.equal(await notice(page, cancellation).count(), 1, 'Across-page duplicates must appear once');
  assert.equal(await notice(page, reminder).getByRole('link').getAttribute('href'), '/my-tickets');
  assert.equal(await notice(page, refund).getByRole('link').getAttribute('href'), '/profile?tab=orders');
  assert.equal(await notice(page, postponed).getByRole('link').count(), 0);
  assert.equal(await notice(page, unknown).getByRole('link').count(), 0);
  await notice(page, unknown).getByText('Update', { exact: true }).waitFor();
  await checkLayout(page, 'en');
  const dateEn = await notice(page, payment).locator('time').textContent();
  await accountMenu(page).click();
  await page.locator('select[data-language-select]').selectOption('vi');
  await notice(page, payment).getByText('Xác nhận vé', { exact: true }).waitFor();
  await accountMenu(page).press('Escape');
  assert.notEqual(await notice(page, payment).locator('time').textContent(), dateEn);
  await notice(page, payment).getByText(payment.body, { exact: true }).waitFor();
  await checkLayout(page, 'vi');
  await accountMenu(page).click();
  await page.locator('select[data-language-select]').selectOption('en');
  await accountMenu(page).press('Escape');

  await page.getByRole('button', { name: 'Unread', exact: true }).click();
  const originalPatch = state.patch;
  state.patch = async () => 503;
  await notice(page, payment).getByRole('button', { name: 'Mark as read' }).click();
  await notice(page, payment).getByRole('alert').getByText('Could not mark this notification as read.').waitFor();
  await unreadBadge(page, 6).waitFor();
  assert.equal(await notice(page, payment).count(), 1);

  state.patch = originalPatch;
  const refreshRequested = deferred();
  const refreshResponse = deferred();
  state.list = async (number, account) => {
    const staleResult = await originalList(number, account);
    refreshRequested.resolve();
    await refreshResponse.promise;
    return staleResult;
  };
  await page.getByRole('button', { name: 'Refresh' }).click();
  await refreshRequested.promise;
  await notice(page, payment).getByRole('button', { name: 'Try again' }).click();
  await notice(page, payment).waitFor({ state: 'detached' });
  await unreadBadge(page, 5).waitFor();
  const nextRead = notice(page, cancellation).getByRole('button', { name: 'Mark as read' });
  assert(await nextRead.evaluate((button) => document.activeElement === button), 'Focus must follow the removed notification');
  refreshResponse.resolve();
  await notice(page, unknown).waitFor({ state: 'detached' });
  await page.getByRole('button', { name: 'All', exact: true }).click();
  await notice(page, payment).getByText('Read', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Unread', exact: true }).click();
  assert.equal(await notice(page, payment).count(), 0, 'A late refresh must not undo a confirmed read');

  state.list = async () => 503;
  state.countStatus = 503;
  await page.getByRole('button', { name: 'Refresh' }).click();
  await page.getByRole('alert').getByText('Could not refresh notifications.').waitFor();
  await notice(page, cancellation).waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await unreadBadge(page, 5).waitFor();
  await accountMenu(page).click();
  assert.match(await notificationsLink(page).textContent(), /5 unread notifications/);
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await inbox.close();

  const empty = await fixture(browser);
  empty.state.list = async () => 503;
  await empty.page.goto('/notifications', { waitUntil: 'domcontentloaded' });
  await empty.page.getByRole('alert').getByText('Could not load notifications.').waitFor();
  empty.state.list = async () => pageData(0, [email], false);
  await empty.page.getByRole('button', { name: 'Try again' }).click();
  await empty.page.getByText('There are no matching notifications in the pages loaded so far.').waitFor();
  await empty.page.getByRole('button', { name: 'Unread', exact: true }).click();
  await empty.page.getByRole('button', { name: 'Load older notifications' }).waitFor();
  empty.state.list = async () => pageData(1, [email], true);
  await empty.page.getByRole('button', { name: 'Load older notifications' }).click();
  await empty.page.getByRole('heading', { name: 'No unread notifications' }).waitFor();
  await empty.page.getByRole('button', { name: 'All', exact: true }).click();
  await empty.page.getByRole('heading', { name: 'No notifications yet' }).waitFor();
  await empty.close();

  const session = await fixture(browser);
  await session.page.goto('/notifications', { waitUntil: 'domcontentloaded' });
  await notice(session.page, payment).waitFor();
  const initialList = session.state.list;
  session.state.list = async () => 403;
  await session.page.getByRole('button', { name: 'Refresh' }).click();
  await session.page.getByRole('alert').getByText('Your current session cannot access these notifications.').waitFor();
  assert.equal(await notice(session.page, payment).count(), 0);
  await unreadBadge(session.page, 6).waitFor({ state: 'detached' });
  session.state.list = initialList;
  await session.page.getByRole('button', { name: 'Try again' }).click();
  await notice(session.page, payment).waitFor();

  const pendingPatch = deferred();
  const latePatch = deferred();
  session.state.patch = async () => {
    pendingPatch.resolve();
    await latePatch.promise;
    return 401;
  };
  await notice(session.page, payment).getByRole('button', { name: 'Mark as read' }).click();
  await pendingPatch.promise;
  const cancelledPatch = session.page.waitForEvent('requestfailed', {
    predicate: (request) => request.method() === 'PATCH' && new URL(request.url()).pathname === '/api/notifications/payment/read',
  });
  await accountMenu(session.page).click();
  await session.page.getByRole('button', { name: 'Sign out' }).click();
  await session.page.waitForURL('**/login');
  await cancelledPatch;
  await session.page.locator('input[name=email]').fill(secondBuyer.email);
  await session.page.locator('input[name=password]').fill('second-password');
  await session.page.locator('button[type=submit]').click();
  await accountMenu(session.page).click();
  await notificationsLink(session.page).click();
  await notice(session.page, newAccountNotice).waitFor();
  latePatch.resolve();
  await unreadBadge(session.page, 1).waitFor();
  assert.equal(await notice(session.page, payment).count(), 0);
  assert.equal(new URL(session.page.url()).pathname, '/notifications');

  session.state.list = async () => 401;
  await session.page.getByRole('button', { name: 'Refresh' }).click();
  await session.page.waitForURL('**/login');
  assert.equal(await notice(session.page, newAccountNotice).count(), 0);
  assert.equal(await unreadBadge(session.page, 1).count(), 0);
  await session.close();
  console.log('Buyer notification inbox Chromium scenarios passed');
} finally {
  await browser.close();
}
