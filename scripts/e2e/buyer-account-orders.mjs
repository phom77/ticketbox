import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';

const origin = process.env.TICKETBOX_BUYER_URL || 'http://localhost:5185';
const output = process.env.ACCOUNT_UI_OUTPUT || '.artifacts/e2e/buyer-discovery/account';
const browser = await chromium.launch();
const buyer = { id: 'buyer-a', email: 'buyer-a@example.test', fullName: 'Minh Nguyễn', role: 'AUDIENCE' };
const nextBuyer = { ...buyer, id: 'buyer-b', email: 'buyer-b@example.test', fullName: 'Lan Trần' };
const now = Date.now();
const date = (offset) => new Date(now + offset).toISOString();
const initialProfile = { ...buyer, phone: null };
const mainEvent = 'Hòa nhạc Mùa Thu tại Nhà hát Thành phố';
const paidEvent = 'Đêm nhạc Bên Sông';
const walletOtherEvent = 'Lễ hội Âm Nhạc Ngoài Trời';
const orderItem = { id: 'item', ticketTypeId: 'standard', ticketTypeName: 'Vé tiêu chuẩn', quantity: 2, unitPrice: 420_000, subtotal: 840_000 };

const holdDuration = 10 * 60_000;

function order(id, status, concertTitle, expiresAt = date(holdDuration), concertId = 'event-main') {
  return { id, status, concertTitle, expiresAt, concertId, totalAmount: 840_000, createdAt: date(-60_000), items: [orderItem] };
}

const orders = [
  order('awaiting-00a1-47b4', 'AWAITING_PAYMENT', mainEvent),
  order('paid-00000-47b4', 'PAID', paidEvent, date(-600_000), 'event-paid'),
  order('elapsed-00-47b4', 'AWAITING_PAYMENT', 'Chương trình đã hết thời gian giữ vé', date(-1_000)),
  order('refunded-0-47b4', 'REFUNDED', 'Sự kiện đã hoàn tiền'),
  order('unknown-00-47b4', 'AWAITING_PAYMENT', 'Giao dịch đang chờ kết quả', null),
  order('canceled-0-47b4', 'CANCELLED', 'Chương trình đã hủy'),
];

function token(user, session) {
  const claims = { ...user, sub: user.id, exp: Math.floor(now / 1000) + 3600, session };
  return `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
}

function ticket(concertId, concertTitle) {
  return { id: `ticket-${concertId}`, concertId, concertTitle, status: 'VALID', ticketTypeId: 'standard', ticketTypeName: 'Vé tiêu chuẩn', issuedAt: date(-60_000), qrCode: 'private-fixture-data' };
}

async function fixture({ language = 'vi', authenticated = true } = {}) {
  const context = await browser.newContext({ locale: language === 'vi' ? 'vi-VN' : 'en', viewport: { width: 1440, height: 920 } });
  await context.addInitScript((locale) => localStorage.setItem('ticketbox.language', locale), language);
  if (authenticated) await context.addCookies([{ name: 'ticketbox_auth_token', value: token(buyer, 1), url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const state = {
    profile: initialProfile, orders, profileStatus: 200, ordersStatus: 200, patchStatus: 200,
    profileReads: 0, orderReads: 0, ticketReads: 0, writes: [], otherBuyer: nextBuyer, paymentStarts: 0,
  };
  const reply = (route, data, status = 200, message = 'Fixture response') => route.fulfill({
    status, json: { code: status, data, message },
  });
  await page.route((url) => url.origin !== new URL(origin).origin, (route) => route.abort());
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const user = request.headers().authorization === ('Bearer ' + token(buyer, 1)) ? buyer : state.otherBuyer;
    if (path === '/api/auth/me') return reply(route, user);
    if (path === '/api/auth/login') return reply(route, { user: state.otherBuyer, accessToken: token(state.otherBuyer, 2) });
    if (path === '/api/notifications/unread-count') return reply(route, { count: 0 });
    if (path === '/api/users/me/profile' && request.method() === 'GET') {
      state.profileReads += 1;
      return reply(route, user === buyer ? state.profile : { ...user, phone: null }, state.profileStatus);
    }
    if (path === '/api/users/me/profile' && request.method() === 'PATCH') {
      const body = request.postDataJSON();
      state.writes.push(body);
      if (state.patchGate) {
        state.patchStarted?.resolve();
        await state.patchGate.promise;
      }
      if (state.patchStatus !== 200) return reply(route, null, state.patchStatus, 'Số điện thoại chưa lưu được.');
      return reply(route, { ...user, ...body });
    }
    if (path === '/api/orders/my') {
      state.orderReads += 1;
      return reply(route, state.orders, state.ordersStatus);
    }
    if (path === '/api/tickets' || path === '/api/tickets/my') {
      state.ticketReads += 1;
      return reply(route, [ticket('event-other', walletOtherEvent), ticket('event-paid', paidEvent)]);
    }
    if (path === '/api/concerts') return reply(route, { content: [], totalPages: 0 });
    if (path.startsWith('/api/concerts/')) {
      const id = path.split('/').at(-1);
      return reply(route, { id, title: id === 'event-paid' ? paidEvent : walletOtherEvent, eventDate: date(id === 'event-other' ? 80_000 : 160_000), venueName: 'Nhà hát Thành phố' });
    }
    if (path.includes('/initiate')) state.paymentStarts += 1;
    return reply(route, null, 404);
  });
  return { context, page, state };
}

async function assertFocused(locator) {
  assert(await locator.evaluate((node) => document.activeElement === node));
}

const results = [];
try {
  const { context, page, state } = await fixture();
  state.ordersStatus = 503;
  await page.goto(origin + '/profile');
  const main = page.getByRole('main');
  await main.getByText(buyer.email, { exact: true }).waitFor();
  const profileReads = state.profileReads;
  assert(profileReads > 0);
  assert.equal(state.orderReads, 0);
  assert.equal(state.ticketReads, 0);
  await main.getByRole('link', { name: 'Lịch sử đơn hàng' }).click();
  await main.getByRole('alert').getByText('Không thể tải đơn hàng').waitFor();
  assert.equal(state.profileReads, profileReads);
  const orderReads = state.orderReads;
  assert(orderReads > 0);
  state.ordersStatus = 200;
  await main.getByRole('button', { name: 'Thử lại' }).click();
  await main.getByRole('heading', { name: mainEvent }).waitFor();
  assert.equal(state.orderReads, orderReads + 1);
  await main.getByRole('link', { name: 'Hồ sơ' }).click();
  await main.getByRole('heading', { name: 'Thông tin cá nhân' }).waitFor();
  assert.equal(state.ticketReads, 0);
  results.push('Profile and orders request their own data and retry independently');

  await main.getByRole('button', { name: 'Chỉnh sửa' }).click();
  const fullName = main.getByRole('textbox', { name: 'Họ tên' });
  const phone = main.getByRole('textbox', { name: 'Số điện thoại' });
  await assertFocused(fullName);
  await fullName.fill('   ');
  await main.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await main.getByRole('alert').getByText('Vui lòng nhập họ tên.').waitFor();
  assert.equal(await fullName.getAttribute('aria-invalid'), 'true');
  await assertFocused(fullName);
  assert.equal(state.writes.length, 0);
  await fullName.fill('Minh Nguyễn Văn');
  await phone.fill('0901234567');
  state.patchStatus = 400;
  await main.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await main.getByRole('alert').getByText('Số điện thoại chưa lưu được.').waitFor();
  assert.equal(await fullName.inputValue(), 'Minh Nguyễn Văn');
  assert.equal(await phone.inputValue(), '0901234567');
  state.patchStatus = 200;
  await main.getByRole('button', { name: 'Lưu thay đổi' }).click();
  await main.getByRole('status').getByText('Đã lưu thông tin cá nhân.').waitFor();
  assert.deepEqual(state.writes, Array.from({ length: 2 }, () => ({ fullName: 'Minh Nguyễn Văn', phone: '0901234567' })));
  await assertFocused(main.getByRole('button', { name: 'Chỉnh sửa' }));
  await page.getByRole('banner').getByText('Minh Nguyễn Văn', { exact: true }).first().waitFor();
  results.push('Save failure retains the form, retry updates the header and restores edit focus');

  await page.goto(origin + '/profile?tab=orders');
  const history = main.getByRole('region', { name: 'Lịch sử đơn hàng' });
  const awaiting = history.getByRole('article', { name: mainEvent });
  const expired = history.getByRole('article', { name: 'Chương trình đã hết thời gian giữ vé' });
  const paid = history.getByRole('article', { name: paidEvent });
  const refund = history.getByRole('article', { name: 'Sự kiện đã hoàn tiền' });
  const unknown = history.getByRole('article', { name: 'Giao dịch đang chờ kết quả' });
  await awaiting.waitFor();
  const continuePayment = 'Tiếp tục thanh toán';
  const checkPayment = 'Kiểm tra thanh toán';
  assert.equal(await awaiting.getByRole('link', { name: continuePayment }).getAttribute('href'), '/checkout?orderId=awaiting-00a1-47b4');
  assert.equal(await expired.getByRole('link', { name: continuePayment }).count(), 0);
  await expired.getByText('Hết hạn', { exact: true }).waitFor();
  assert.equal(await expired.getByRole('link', { name: checkPayment }).getAttribute('href'), '/payment/result?orderId=elapsed-00-47b4');
  assert.equal(await unknown.getByRole('link', { name: checkPayment }).getAttribute('href'), '/payment/result?orderId=unknown-00-47b4');
  await refund.getByText('Đã hoàn tiền', { exact: true }).waitFor();
  assert.equal(await refund.getByRole('link').count(), 0);
  await history.getByRole('button', { name: 'Cần xử lý' }).click();
  assert.equal(await history.getByRole('article').count(), 2);
  await history.getByRole('button', { name: 'Đã đóng' }).click();
  assert.equal(await history.getByRole('article').count(), 3);
  await history.getByRole('button', { name: 'Đã thanh toán' }).click();
  assert.equal(await history.getByRole('article').count(), 1);
  await paid.getByRole('link', { name: 'Xem vé của sự kiện' }).click();
  await page.waitForURL('**/my-tickets?concertId=event-paid');
  const group = main.getByRole('article', { name: paidEvent });
  const expand = group.getByRole('button', { name: `Ẩn vé · ${paidEvent}` });
  await expand.waitFor();
  assert.equal(await expand.getAttribute('aria-expanded'), 'true');
  assert.equal(await main.getByRole('article').first().getAttribute('aria-labelledby'), await group.getAttribute('aria-labelledby'));
  assert.equal(await main.getByRole('img', { name: /mã QR/i }).count(), 0);
  await expand.click();
  await group.getByRole('button', { name: `Xem vé · ${paidEvent}` }).waitFor();
  await page.goto(origin + '/my-tickets?concertId=does-not-exist');
  await main.getByRole('heading', { name: walletOtherEvent }).waitFor();
  assert.equal(await main.getByRole('button', { name: /ẩn vé/i }).count(), 0);
  await page.goto(origin + '/profile?tab=tickets');
  await page.waitForURL('**/my-tickets');
  assert.equal(state.paymentStarts, 0);
  results.push('Order status, refund, deadline, wallet event context, old tab alias and exact IDs work');
  await context.close();

  const expiry = await fixture();
  await expiry.page.clock.install({ time: new Date(now) });
  await expiry.page.goto(origin + '/profile?tab=orders');
  const expiring = expiry.page.getByRole('article', { name: mainEvent });
  await expiring.getByRole('link', { name: continuePayment }).waitFor();
  await expiry.page.clock.fastForward(holdDuration + 100);
  await expiring.getByText('Hết hạn', { exact: true }).waitFor();
  assert.equal(await expiring.getByRole('link', { name: continuePayment }).count(), 0);
  await expiry.context.close();
  results.push('The payment action changes when the order expires while the list is open');

  const empty = await fixture();
  empty.state.orders = [];
  empty.state.profileStatus = 503;
  await empty.page.goto(origin + '/profile?tab=orders');
  await empty.page.getByRole('heading', { name: 'Chưa có đơn hàng' }).waitFor();
  assert.equal(empty.state.profileReads, 0);
  assert.equal(empty.state.ticketReads, 0);
  await empty.context.close();

  for (const [identity, sessionDescription] of [[nextBuyer, 'another buyer'], [{ ...buyer, fullName: 'Minh sau khi đăng nhập' }, 'a new session for the same buyer']]) {
    const swap = await fixture();
    swap.state.otherBuyer = identity;
    await swap.page.goto(origin + '/profile');
    const swapMain = swap.page.getByRole('main');
    await swapMain.getByRole('button', { name: 'Chỉnh sửa' }).click();
    await swapMain.getByRole('textbox', { name: 'Họ tên' }).fill('Lưu đến trễ');
    swap.state.patchGate = Promise.withResolvers();
    swap.state.patchStarted = Promise.withResolvers();
    await swapMain.getByRole('button', { name: 'Lưu thay đổi' }).click();
    await swap.state.patchStarted.promise;
    await swap.page.getByRole('button', { name: /menu tài khoản/i }).click();
    await swap.page.getByRole('button', { name: 'Đăng xuất' }).click();
    await swap.page.waitForFunction(() => !document.cookie.includes('ticketbox_auth_token='));
    await swap.page.evaluate(() => {
      history.replaceState(window.history.state, '', '/profile');
      dispatchEvent(new PopStateEvent('popstate'));
    });
    await swap.page.waitForURL('**/login');
    await swap.page.getByLabel(/email/i).fill(identity.email);
    await swap.page.getByLabel('Mật khẩu', { exact: true }).fill('test-password');
    await swap.page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    await swap.page.waitForURL('**/profile');
    await swapMain.getByText(identity.fullName, { exact: true }).waitFor();
    swap.state.patchGate.resolve();
    await swapMain.getByRole('link', { name: 'Lịch sử đơn hàng' }).click();
    await swapMain.getByRole('heading', { name: mainEvent }).waitFor();
    await swap.page.getByRole('banner').getByText(identity.fullName, { exact: true }).first().waitFor();
    assert.equal(await swap.page.getByText('Lưu đến trễ', { exact: true }).count(), 0);
    await swap.context.close();
    results.push(`A delayed save cannot update the header for ${sessionDescription}`);
  }

  await mkdir(output, { recursive: true });
  for (const language of ['vi', 'en']) {
    const preview = await fixture({ language });
    for (const [pageName, path, title] of [
      ['orders', '/profile?tab=orders', language === 'vi' ? 'Lịch sử đơn hàng' : 'Order history'],
      ['profile', '/profile', language === 'vi' ? 'Thông tin cá nhân' : 'Personal details'],
    ]) {
      await preview.page.goto(origin + path);
      const previewMain = preview.page.getByRole('main');
      await previewMain.getByRole('heading', { name: title, exact: true }).waitFor();
      await (pageName === 'orders' ? previewMain.getByRole('heading', { name: mainEvent }) : previewMain.getByText(buyer.email, { exact: true })).waitFor();
      for (const width of [320, 390, 834, 1440]) {
        await preview.page.setViewportSize({ width, height: width < 834 ? 820 : 920 });
        const overflow = await preview.page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
        assert(overflow <= 1, `${pageName} ${language} at ${width}px overflows by ${overflow}px`);
        await preview.page.screenshot({ animations: 'disabled', path: join(output, `${pageName}-${language}-${width}.png`) });
      }
    }
    await preview.context.close();
  }
  results.push('Profile and orders fit in Vietnamese and English at 320, 390, 834 and 1440 CSS pixels');
  results.forEach((result) => console.log('PASS ' + result));
} finally {
  await browser.close();
}
