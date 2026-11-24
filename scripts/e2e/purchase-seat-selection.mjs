import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.TICKETBOX_BUYER_URL ?? 'http://localhost:5185').origin;
const concertId = 'seat-selection-fixture';
const buyer = { id: 'seat-buyer', email: 'seat-buyer@example.test', fullName: 'Người mua vé', role: 'AUDIENCE' };
const claims = { ...buyer, sub: buyer.id, exp: Math.floor(Date.now() / 1000) + 3600 };
const jwt = `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
const accessToken = 'seat-selection-fixture-admission';
const types = [
  { id: 'general', name: 'GA', price: 250000, maxPerAccount: 4, zoneColor: '#1468a0' },
  { id: 'vip', name: 'VIP', price: 500000, maxPerAccount: 1, zoneColor: '#763ab1' },
].map((item) => ({ ...item, concertId, totalQuantity: 20, isActive: true }));
const concert = {
  id: concertId, title: 'Đêm hòa nhạc tại Nhà hát Thành phố', venueName: 'Nhà hát Thành phố',
  eventDate: new Date(Date.now() + 86400000).toISOString(), saleStartAt: new Date(Date.now() - 60000).toISOString(),
  saleEndAt: null, status: 'ON_SALE', posterUrl: null, ticketTypes: types,
};
const mapSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 240 120">
  <g data-ticket-type-id="general" data-zone-name="GA"><rect x="10" y="10" width="100" height="100" rx="4" fill="#aaccdd"/></g>
  <g data-ticket-type-id="vip" data-zone-name="VIP"><rect x="130" y="10" width="100" height="100" rx="4" fill="#bb99dd"/><text x="160" y="66">VIP</text></g>
</svg>`;

const browser = await chromium.launch();

async function fixture({ svg = mapSvg, admitted = true, expiresIn = 300000, held = { general: 1 } } = {}) {
  const context = await browser.newContext({ locale: 'vi-VN', viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: 'ticketbox_auth_token', value: jwt, url: origin }]);
  const deadline = new Date(Date.now() + expiresIn).toISOString();
  const page = await context.newPage();
  page.setDefaultTimeout(6000);
  if (admitted) await page.addInitScript(({ key, value }) => {
    if (sessionStorage.getItem('seat-fixture-set')) return;
    sessionStorage.setItem(key, JSON.stringify(value));
    sessionStorage.setItem('seat-fixture-set', '1');
  }, {
    key: 'ticketbox.queue-admission',
    value: { concertId, queueAccessToken: accessToken, sessionExpiresAt: deadline },
  });

  const state = {
    held: { ...held }, stock: { general: 20, vip: 20 }, requests: [], mutations: [],
    holdsGate: null, holdsStatus: 200, mode: null,
  };
  const reply = (route, data, status = 200, message = 'OK') => route.fulfill({
    status, json: { code: status, message, data },
  });
  const list = () => Object.entries(state.held)
    .filter(([, quantity]) => quantity > 0)
    .map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity, expiresAt: deadline }));

  await page.route((url) => /^\/api\//.test(url.pathname), async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (path === '/api/auth/me') return reply(route, buyer);
    if (path.startsWith('/api/notifications')) return reply(route, { count: 0 });
    if (path === `/api/concerts/${concertId}`) return reply(route, { ...concert, seatMapSvg: svg });
    if (path === `/api/concerts/${concertId}/ticket-types`) return reply(route, types);
    if (path === `/api/concerts/${concertId}/availability`) return reply(route, {
      refreshedAt: new Date().toISOString(),
      items: types.map((item) => ({
        ticketTypeId: item.id, availableQty: state.stock[item.id], totalQuantity: item.totalQuantity,
      })),
    });
    if (path.startsWith('/api/queue/')) return reply(route, { status: 'WAITING', position: 2, peopleAhead: 1 });
    if (path === `/api/reservations/concerts/${concertId}/holds`) {
      state.requests.push(request.headers()['queue-access-token']);
      if (state.holdsGate) await state.holdsGate;
      return reply(route, list(), state.holdsStatus);
    }
    const match = path.match(/^\/api\/reservations\/concerts\/[^/]+\/ticket-types\/([^/]+)\/(reserve|release)$/);
    if (match) {
      const [, id, action] = match;
      state.mutations.push({ id, action, headers: request.headers(), body: request.postDataJSON() });
      if (state.mode === 'denied') return reply(route, null, 403, 'Expired');
      if (state.mode === 'limit') return reply(route, null, 409, 'Bạn đã vượt quá giới hạn giữ vé.');
      if (state.mode === 'soldout') {
        state.stock[id] = 0;
        return reply(route, null, 409, 'Vé đã bán hết cho hạng vé GA');
      }
      state.held[id] = (state.held[id] ?? 0) + (action === 'reserve' ? 1 : -1);
      if (state.mode === 'lost') return route.abort('failed');
      return reply(route, { ticketTypeId: id, quantity: state.held[id], expiresAt: deadline });
    }
    return reply(route, [], 404);
  });
  await page.route((url) => url.origin !== origin, (route) => route.abort());

  return { page, state, close: () => context.close() };
}

const seatsUrl = `${origin}/concerts/${concertId}/seats`;

try {
  const { page, state, close } = await fixture();
  await page.goto(seatsUrl);
  const main = page.getByRole('main');
  const bar = main.locator('.purchase-action-bar');
  await bar.getByText('Đang giữ 1 vé').waitFor();
  assert(state.requests.length > 0 && state.requests.every((token) => token === accessToken));
  const subtotal = bar.getByText(/250[.\s]000/);
  const continueButton = bar.getByRole('button', { name: 'Tiếp tục thanh toán', exact: true });
  for (const control of [bar.getByText('Đang giữ 1 vé'), subtotal, continueButton]) {
    const bounds = await control.boundingBox();
    assert(bounds && bounds.y >= 0 && bounds.y + bounds.height <= 844);
  }
  assert.equal(await main.getByRole('timer').count(), 1);
  for (const [width, height] of [[320, 804], [834, 1024], [1440, 900]]) {
    await page.setViewportSize({ width, height });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
  }
  await page.setViewportSize({ width: 390, height: 844 });

  // Map and list sit side by side on desktop and behind tabs below 1024px.
  await page.setViewportSize({ width: 1440, height: 900 });
  const seatMap = main.locator('.concert-seat-map');
  const vipZone = seatMap.getByRole('button', { name: 'VIP', exact: true });
  const generalZone = seatMap.getByRole('button', { name: 'GA', exact: true });
  const vip = main.locator('.ts-row').filter({ has: page.getByText('VIP', { exact: true }) });
  const general = main.locator('.ts-row').filter({ has: page.getByText('GA', { exact: true }) });
  const selected = async (row) => (await row.getAttribute('data-selected')) === 'true';
  await vipZone.click();
  assert.equal(await selected(vip), true);
  assert.equal(await vipZone.locator('text').evaluate((label) => getComputedStyle(label).stroke), 'none');
  await generalZone.click();
  assert.equal(await generalZone.getAttribute('aria-pressed'), 'true');
  await vipZone.focus();
  await page.keyboard.press('Space');
  assert.equal(await selected(vip), true);

  state.mode = 'limit';
  await vip.getByRole('button', { name: 'Thêm một vé VIP' }).click();
  await vip.getByRole('alert').getByText('Bạn đã đạt giới hạn số vé của buổi diễn này.', { exact: false }).waitFor();
  await subtotal.waitFor();

  state.mode = 'lost';
  state.holdsStatus = 503;
  const check = Promise.withResolvers();
  state.holdsGate = check.promise;
  await vip.getByRole('button', { name: 'Thêm một vé VIP' }).click();
  await vip.getByText('Đang kiểm tra số vé đã giữ…').waitFor();
  await subtotal.waitFor();
  assert.equal(await continueButton.isEnabled(), false);
  check.resolve();
  const retry = vip.getByRole('button', { name: 'Kiểm tra lại vé đang giữ' });
  await retry.waitFor();
  assert.equal(await continueButton.isEnabled(), false);
  state.holdsStatus = 200;
  await retry.click();
  await bar.getByText('Đang giữ 2 vé').waitFor();
  assert.equal(await vip.getByRole('button', { name: 'Thêm một vé VIP' }).isEnabled(), false);
  assert.equal(state.mutations.filter(({ id }) => id === 'vip').length, 2);

  state.mode = 'soldout';
  await general.getByRole('button', { name: 'Thêm một vé GA' }).click();
  await general.getByRole('alert').getByText('Có người vừa lấy những vé đó.', { exact: false }).waitFor();
  await general.getByText('Hết vé', { exact: true }).waitFor();
  await bar.getByText(/750[.\s]000/).waitFor();

  state.mode = null;
  await general.getByRole('button', { name: 'Bỏ một vé GA' }).click();
  await bar.getByText('Đang giữ 1 vé').waitFor();
  await bar.getByText(/500[.\s]000/).waitFor();
  assert(state.mutations.every(({ headers, body }) => headers['queue-access-token'] === accessToken && body.quantity === 1));
  await continueButton.click();
  await page.waitForURL('**/checkout');
  const next = await page.evaluate(() => history.state.usr);
  assert.deepEqual(next.selection, [{ id: 'vip', name: 'VIP', price: 500000, quantity: 1 }]);
  assert.equal(next.queueAccessToken, accessToken);
  await close();

  const noMap = await fixture({ svg: null, held: {} });
  await noMap.page.goto(seatsUrl);
  await noMap.page.getByRole('tab', { name: 'Bản đồ' }).click();
  await noMap.page.getByText('Sơ đồ chỗ không khả dụng', { exact: true }).waitFor();
  await noMap.page.getByRole('tab', { name: 'Danh sách' }).click();
  await noMap.page.getByRole('button', { name: 'Thêm một vé GA' }).click();
  await noMap.page.locator('.purchase-action-bar').getByText('Đang giữ 1 vé').waitFor();
  await noMap.page.reload();
  await noMap.page.locator('.purchase-action-bar').getByText('Đang giữ 1 vé').waitFor();
  await noMap.page.setViewportSize({ width: 1440, height: 900 });
  await noMap.page.getByRole('combobox', { name: 'Ngôn ngữ' }).selectOption('en');
  await noMap.page.getByText('Seat map unavailable', { exact: true }).waitFor();
  noMap.state.mode = 'denied';
  await noMap.page.getByRole('button', { name: 'Add one GA ticket' }).click();
  await noMap.page.waitForURL('**/waiting-room');
  await noMap.close();

  const direct = await fixture({ admitted: false });
  await direct.page.goto(seatsUrl);
  await direct.page.waitForURL('**/waiting-room');
  await direct.page.getByRole('alert').getByText('Bạn cần có lượt chọn vé. TicketBox đã đưa bạn về phòng chờ.').waitFor();
  assert.equal(direct.state.requests.length, 0);
  await direct.close();

  const expired = await fixture({ expiresIn: 3500 });
  await expired.page.goto(seatsUrl);
  await expired.page.getByRole('timer').waitFor();
  await expired.page.waitForURL('**/waiting-room');
  await expired.page.getByRole('alert').getByText('Phiên mua vé đã hết hạn. Vui lòng vào lại phòng chờ.').waitFor();
  await expired.close();

  console.log('Seat selection: synchronized map and list, 390px actions, confirmed holds, conflicts, lost-response recovery, release, checkout, reload, and session guards.');
} finally {
  await browser.close();
}
