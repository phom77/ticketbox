import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.TICKETBOX_BUYER_URL || 'http://localhost:5185';
const user = { id: 'fixture-buyer', email: 'buyer@example.test', fullName: 'Khách mua vé', role: 'AUDIENCE' };
const claims = { ...user, sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 };
const token = `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
const payload = 'ticketbox-wallet-qr-fixture-private';
const fallbackTitle = 'Đêm nhạc bên sông';
const eventTitle = 'Đêm nhạc bên sông dành cho những người yêu hòa nhạc và nghệ thuật biểu diễn';
const browser = await chromium.launch();

const eventDate = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
const concerts = {
  near: {
    id: 'near', title: eventTitle, venueName: 'Nhà hát Bên Sông', eventDate: eventDate(1),
    posterUrl: `${origin}/wallet-loaded-poster.gif`, translations: { en: { title: 'Riverside concert' } },
  },
  far: {
    id: 'far', title: 'Đêm nhạc tháng tới', venueName: 'Sân khấu Mở', eventDate: eventDate(40),
    posterUrl: `${origin}/wallet-poster.png`,
  },
};

function ticket(id, concertId, concertTitle, status = 'VALID', details = {}) {
  return {
    id, concertId, concertTitle, status, ticketTypeId: 'ga', ticketTypeName: 'GA',
    issuedAt: eventDate(-1), qrCode: `${payload}-${id}`, ...details,
  };
}

const firstId = 'd861b58f-1123-4c5c-a098-228392f8fbe0';
const secondId = 'd861b58f-3fc8-4e0c-afae-0338c50358b8';
const usedId = '15a994d3-1a9b-4d0c-bb96-16f426c84aa0';
const ticketCode = 'VE-004398';
const ownedTickets = [
  ticket('far-0001', 'far', concerts.far.title),
  ticket(firstId, 'near', fallbackTitle, 'VALID', { referenceCode: ticketCode }),
  ticket(secondId, 'near', fallbackTitle),
  ticket(usedId, 'near', fallbackTitle, 'USED', { referenceCode: null, sectionLabel: 'Ban công', rowLabel: 'A', seatLabel: '7' }),
  ...Array.from({ length: 24 }, (_, index) =>
    ticket(`archive-${index}`, 'archive', 'Chương trình trước đây', index === 23 ? 'USED' : 'CANCELLED')),
];

async function fixture({ tickets = ownedTickets, authenticated = true } = {}) {
  const context = await browser.newContext({ locale: 'vi-VN', viewport: { width: 390, height: 844 } });
  if (authenticated) await context.addCookies([{ name: 'ticketbox_auth_token', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  const consoleMessages = [];
  page.on('console', (message) => consoleMessages.push(message.text()));
  const state = { tickets, requests: 0, listStatus: 200, listGate: null, catalogGate: null, posterGate: null };
  const reply = (route, data, status = 200) => route.fulfill({
    status,
    json: { code: status, data, message: status === 200 ? 'OK' : 'Fixture failure' },
  });

  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const { pathname } = new URL(route.request().url());
    if (pathname === '/api/auth/me') return reply(route, user);
    if (pathname === '/api/notifications/unread-count') return reply(route, { count: 0 });
    if (pathname === '/api/tickets') {
      state.requests += 1;
      if (state.listGate) await state.listGate;
      return reply(route, state.tickets, state.listStatus);
    }
    if (pathname.startsWith('/api/concerts/')) {
      if (state.catalogGate) await state.catalogGate;
      const concert = concerts[pathname.split('/').at(-1)];
      return reply(route, concert ?? null, concert ? 200 : 503);
    }
    return reply(route, null, 404);
  });

  await page.route('**/wallet-poster.png', async (route) => {
    if (state.posterGate) await state.posterGate;
    return route.abort();
  });
  await page.route('**/wallet-loaded-poster.gif', (route) => route.fulfill({
    contentType: 'image/gif',
    body: Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64'),
  }));
  await page.route((url) => url.origin !== new URL(origin).origin, (route) => route.abort());

  return { context, page, state, consoleMessages };
}

async function assertFocused(locator) {
  assert(await locator.evaluate((node) => document.activeElement === node));
}

async function assertNoTicketId(scope) {
  for (const id of [firstId, secondId, usedId]) {
    const prefix = id.slice(0, 8);
    assert.doesNotMatch(await scope.innerText(), new RegExp(prefix, 'i'));
    assert.equal(await scope.locator(`[title*="${prefix}" i], [aria-label*="${prefix}" i]`).count(), 0);
  }
}

try {
  const { context, page, state, consoleMessages } = await fixture();
  const catalog = Promise.withResolvers();
  const poster = Promise.withResolvers();
  state.catalogGate = catalog.promise;
  state.posterGate = poster.promise;
  await page.goto(`${origin}/my-tickets`);
  const main = page.getByRole('main');
  await main.getByRole('heading', { name: 'Vé của tôi', exact: true }).waitFor();
  await main.getByRole('heading', { name: fallbackTitle, exact: true }).waitFor();
  assert.equal(await main.getByRole('img', { name: /mã QR/i }).count(), 0);
  await main.getByRole('button', { name: `Xem vé · ${fallbackTitle}` }).click();
  assert.equal(await main.getByText(`Mã vé ${ticketCode}`, { exact: true }).count(), 1, 'Wallet shows the issued code independent of the UUID.');
  const firstQr = main.getByRole('button', { name: `Mở mã QR · ${ticketCode}` });
  const legacyQr = main.getByRole('button', { name: 'Mở mã QR · GA · Vé 2' });
  await legacyQr.waitFor();
  await assertNoTicketId(main);
  await firstQr.focus();
  catalog.resolve();
  await main.getByRole('heading', { name: eventTitle }).waitFor();
  assert.equal(await main.getByRole('heading', { level: 2 }).first().textContent(), eventTitle);
  await assertFocused(firstQr);
  const artwork = main.getByRole('article', { name: concerts.far.title }).locator('.wallet-event-art');
  await artwork.locator('svg').waitFor();
  assert.equal(await artwork.locator('img').isVisible(), false);
  const fallbackFailed = page.waitForEvent('requestfailed', (request) => new URL(request.url()).hostname === 'images.unsplash.com');
  poster.resolve();
  await fallbackFailed;
  assert(await artwork.locator('svg').isVisible());
  assert.equal(await artwork.locator('img').isVisible(), false);
  const loadedPoster = main.getByRole('article', { name: eventTitle }).locator('.wallet-event-art img');
  await loadedPoster.waitFor();
  assert(await loadedPoster.evaluate((image) => image.naturalWidth > 0));
  await main.getByRole('heading', { name: 'Chương trình trước đây' }).waitFor();
  await page.keyboard.press('Enter');

  const dialog = page.getByRole('dialog', { name: eventTitle });
  await dialog.waitFor();
  await dialog.getByText(ticketCode, { exact: true }).waitFor();
  await assertNoTicketId(dialog);
  const qr = dialog.getByRole('img', { name: /mã QR vé/i });
  const bounds = await qr.boundingBox();
  const panel = await dialog.boundingBox();
  assert(bounds && panel && bounds.width >= 200 && bounds.y >= panel.y && bounds.y + bounds.height <= panel.y + panel.height);
  const close = dialog.getByRole('button', { name: 'Đóng chi tiết vé' });
  await assertFocused(close);
  for (const key of ['Tab', 'Tab', 'Shift+Tab']) {
    await page.keyboard.press(key);
    assert(await dialog.evaluate((node) => node.contains(document.activeElement)));
  }
  await page.keyboard.press('Escape');
  await dialog.waitFor({ state: 'hidden' });
  await assertFocused(firstQr);

  const usedTicket = main.getByRole('button', { name: /Xem chi tiết · GA · Ban công/ });
  await usedTicket.click();
  await dialog.getByText('Đã dùng', { exact: true }).waitFor();
  await dialog.getByText(/Ban công/).waitFor();
  await assertNoTicketId(dialog);
  assert.equal(await qr.count(), 0);
  await close.click();

  for (const [width, height] of [[320, 804], [390, 844], [834, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 1, `Ticket wallet overflows ${width}px viewport by ${overflow}px`);
  }

  const archive = main.getByRole('article', { name: 'Chương trình trước đây' });
  await archive.getByRole('button', { name: 'Xem vé · Chương trình trước đây' }).click();
  const archivedTicket = archive.getByRole('button', { name: 'Xem chi tiết · GA · Vé 24' });
  await archivedTicket.waitFor();
  await main.getByRole('button', { name: 'Đã dùng', exact: true }).click();
  assert.equal(await archive.getByRole('listitem').count(), 1);
  await archivedTicket.waitFor();

  await main.getByRole('button', { name: 'Đã chuyển', exact: true }).click();
  await main.getByRole('heading', { name: 'Chưa có vé phù hợp' }).waitFor();
  await main.getByRole('button', { name: 'Xóa bộ lọc' }).click();
  await main.getByRole('heading', { name: eventTitle }).waitFor();
  const groupButton = main.getByRole('button', { name: new RegExp(`vé · ${eventTitle}`, 'i') });
  if (await groupButton.getAttribute('aria-expanded') === 'false') await groupButton.click();

  const refresh = main.getByRole('button', { name: 'Làm mới' });
  const changed = Promise.withResolvers();
  state.listGate = changed.promise;
  await refresh.click();
  await firstQr.click();
  await qr.waitFor();
  state.tickets = ownedTickets.map((item) => item.id === firstId ? { ...item, status: 'CANCELLED' } : item);
  changed.resolve();
  await dialog.getByText('Đã hủy', { exact: true }).waitFor();
  assert.equal(await qr.count(), 0);
  await close.click();

  const removed = Promise.withResolvers();
  state.listGate = removed.promise;
  await refresh.click();
  await legacyQr.click();
  await qr.waitFor();
  await dialog.getByText('Vé 2', { exact: true }).waitFor();
  await assertNoTicketId(dialog);
  state.tickets = state.tickets.filter((item) => item.id !== secondId);
  removed.resolve();
  await dialog.waitFor({ state: 'hidden' });
  await assertFocused(groupButton);

  assert(!page.url().includes(payload));
  assert(!consoleMessages.some((message) => message.includes(payload)));
  assert(await page.evaluate((secret) => [localStorage, sessionStorage].every((storage) =>
    Object.values(storage).every((item) => !item.includes(secret))), payload));

  await page.getByRole('banner').getByRole('button', { name: 'Mở menu tài khoản' }).click();
  await page.getByRole('combobox', { name: 'Ngôn ngữ' }).selectOption('en');
  await page.keyboard.press('Escape');
  await main.getByRole('heading', { name: 'My Tickets', exact: true }).waitFor();
  const translatedGroup = main.getByRole('button', { name: /tickets · Riverside concert/i });
  await translatedGroup.waitFor();

  const expired = Promise.withResolvers();
  state.tickets = ownedTickets;
  state.listGate = null;
  await main.getByRole('button', { name: 'Refresh' }).click();
  await main.getByRole('button', { name: `Show QR code · ${ticketCode}` }).waitFor();
  state.listStatus = 401;
  state.listGate = expired.promise;
  await main.getByRole('button', { name: 'Refresh' }).click();
  await main.getByRole('button', { name: `Show QR code · ${ticketCode}` }).click();
  await page.getByRole('dialog', { name: 'Riverside concert' }).waitFor();
  expired.resolve();
  await page.waitForURL('**/login');
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
  await context.close();
  console.log('Wallet: 28 tickets, late and failed metadata, ordering, keyboard, refresh, missing ticket, locale and expired session.');

  const empty = await fixture({ tickets: [] });
  empty.state.listStatus = 503;
  await empty.page.goto(`${origin}/my-tickets`);
  await empty.page.getByRole('heading', { name: 'Không thể tải vé' }).waitFor();
  empty.state.listStatus = 200;
  await empty.page.getByRole('button', { name: 'Thử lại' }).click();
  await empty.page.getByRole('heading', { name: 'Bạn chưa có vé' }).waitFor();
  assert.equal(await empty.page.getByRole('link', { name: 'Khám phá sự kiện', exact: true }).first().getAttribute('href'), '/');
  await empty.context.close();

  const forbidden = await fixture();
  await forbidden.page.goto(`${origin}/my-tickets`);
  await forbidden.page.getByRole('article', { name: eventTitle, exact: true }).waitFor();
  forbidden.state.listStatus = 403;
  await forbidden.page.getByRole('button', { name: 'Làm mới' }).click();
  await forbidden.page.getByRole('heading', { name: 'Không thể tải vé' }).waitFor();
  assert.equal(await forbidden.page.getByRole('main').getByRole('article').count(), 0);
  await forbidden.context.close();

  const signedOut = await fixture({ authenticated: false });
  await signedOut.page.goto(`${origin}/my-tickets`);
  await signedOut.page.waitForURL('**/login');
  assert.equal(signedOut.state.requests, 0);
  await signedOut.context.close();
  console.log('Wallet: list error and retry, empty owned list, access denied and signed-out route guard.');
} finally {
  await browser.close();
}
