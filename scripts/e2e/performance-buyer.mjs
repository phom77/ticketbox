import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = new URL(process.env.TICKETBOX_BUYER_URL ?? 'http://localhost:5187').origin;
const buyer = { id: 'viewer', role: 'AUDIENCE', email: 'buyer@example.test', fullName: 'Fixture buyer' };
const token = 'fixture.' + Buffer.from(JSON.stringify({
  ...buyer, sub: buyer.id, exp: Math.floor(Date.now() / 1000) + 3600,
})).toString('base64url') + '.fixture';
const future = (minutes) => new Date(Date.now() + minutes * 60_000).toISOString();
const eventId = 'river-tour';
const night = (id, venueName) => ({
  id, eventId, venueName, startsAt: future(1440), endsAt: future(1560),
  timezone: 'Asia/Ho_Chi_Minh', status: 'ON_SALE', saleStartAt: future(-60), saleEndAt: future(60),
  saleVersion: 2, layoutVersion: 1, legacyConcertId: null,
});
const event = {
  id: eventId, title: 'River Tour', description: 'Two performances',
  performances: [night('first', 'Studio One'), night('second', 'Studio Two')],
};
const eventUrl = '/events/' + eventId;
const performanceUrl = eventUrl + '/performances/second';
const sectionId = 'balcony';
const order = {
  id: 'seat-order', concertId: 'second', concertTitle: event.title, eventId, performanceId: 'second',
  performanceTitle: event.title, performanceStartsAt: event.performances[1].startsAt,
  performanceVenueName: 'Studio Two', status: 'AWAITING_PAYMENT', totalAmount: 250000, expiresAt: future(15),
  items: [{ id: 'seat-item', ticketTypeId: 'reserved', ticketTypeName: 'Reserved', quantity: 1,
    unitPrice: 250000, seatId: 'a12', sectionLabel: 'Balcony', rowLabel: 'A', seatLabel: '12' }],
};
const polygon = [{ x: 8, y: 4 }, { x: 95, y: 4 }, { x: 95, y: 60 }, { x: 8, y: 60 }];
const section = { id: sectionId, code: 'BAL', label: 'Balcony', kind: 'ASSIGNED', points: polygon };
const groups = [
  { id: 'standing', sectionId: 'floor', sectionLabel: 'Floor', kind: 'GA', available: 4, offers: [{ id: 'ga', name: 'General admission', price: 100000, active: true }] },
  { id: 'priced', sectionId, sectionLabel: 'Balcony', kind: 'ASSIGNED', available: 1, offers: [{ id: 'reserved', name: 'Reserved', price: 250000, active: true }] },
];
const browser = await chromium.launch();
try {
  const context = await browser.newContext({ locale: 'en-US', viewport: { width: 390, height: 844 } });
  await context.addCookies([{ name: 'ticketbox_auth_token', value: token, url: origin }]);
  const page = await context.newPage();
  await context.tracing.start({ screenshots: true, snapshots: true });
  page.setDefaultTimeout(12_000);
  let detailReads = 0;
  let admit = false;
  const legacyPerformanceReads = [];
  let hold = { version: 0, expiresAt: null, items: [], totalAmount: 0 };
  let released = 0;
  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const path = url.pathname;
    if (!path.startsWith('/api/')) return route.continue();
    const send = (data, status = 200) => route.fulfill({ status, json: { code: status, data, message: 'Fixture' } });
    if (path === '/api/auth/me') return send(buyer);
    if (path === '/api/notifications/unread-count') return send({ count: 0 });
    if (path === '/api/payments/providers') return send(['MOCK']);
    if (path === '/api/payments/seat-order/status') return send({ provider: 'MOCK', attemptState: null });
    if (path === '/api/orders/seat-order') return send(order);
    if (path === '/api/v2/performances/second/orders') return send(order, 201);
    if (path === '/api/v2/events/discovery') {
      const first = event.performances[0];
      return send({
        content: [{ ...first, title: event.title, eventDate: first.startsAt, posterUrl: null }],
        totalPages: 1, totalElements: 1, first: true, last: true,
      });
    }
    if (path === '/api/v2/events/' + eventId) return send(event);
    if (path === '/api/concerts/first') {
      return send({ ...event.performances[0], title: 'Legacy River Show', eventDate: future(1440), ticketTypes: [] });
    }
    if (path === '/api/concerts/first/ticket-types') return send([]);
    if (path.startsWith('/api/concerts/second')) legacyPerformanceReads.push(path);
    if (path === '/api/queue/concerts/second/join') {
      if (!admit) return send({ status: 'WAITING', position: 1500, pollAfterMs: 60_000 });
      return send({ status: 'ADMITTED', queueAccessToken: 'seat-token', sessionExpiresAt: future(10) });
    }
    if (path === '/api/queue/concerts/second/leave') return send({ status: 'LEFT' });
    if (path === '/api/v2/performances/second/layout') {
      return send(null, 503);
    }
    if (path === '/api/v2/performances/second/layout/sections/balcony') {
      return send({ version: 1, section: { ...section, rows: [{ id: 'a', code: 'A', label: 'A', seats: [
        { id: 'a12', label: '12', x: 30, y: 25, accessible: false, restrictedView: false, blocked: false },
      ] }] } });
    }
    if (path === '/api/v2/performances/first/availability' || path === '/api/v2/performances/second/availability') {
      return send({ layoutVersion: 1, saleVersion: 2, groups });
    }
    if (path === '/api/v2/performances/second/availability/sections/balcony') {
      detailReads++;
      return send({ layoutVersion: 1, saleVersion: 2, sectionId, seats: [{ id: 'a12', available: true, groupId: 'priced' }] });
    }
    if (path === '/api/v2/performances/second/hold') {
      assert.equal(route.request().headers()['queue-access-token'], 'seat-token');
      if (route.request().method() === 'GET') return send(hold);
      if (route.request().method() === 'DELETE') {
        released++;
        hold = { version: hold.version + 1, expiresAt: null, items: [], totalAmount: 0 };
        return route.fulfill({ status: 204 });
      }
      const { items, layoutVersion, holdVersion } = route.request().postDataJSON();
      assert.equal(layoutVersion, 1);
      assert.equal(holdVersion, hold.version);
      assert.deepEqual(items, [{ offerId: 'reserved', seatId: 'a12' }]);
      assert.ok(route.request().headers()['idempotency-key']);
      hold = {
        version: 1, expiresAt: future(10), totalAmount: 250000,
        items: [{ offerId: 'reserved', seatId: 'a12', quantity: 1, unitPrice: 250000, offerName: 'Reserved', sectionLabel: 'Balcony', rowLabel: 'A', seatLabel: '12' }],
      };
      return send(hold);
    }
    return send(null, 404);
  });

  try {
    await page.goto(origin + '/events');
    await page.getByRole('link', { name: 'River Tour · Find tickets' }).click();
    await page.getByRole('heading', { name: 'River Tour', exact: true }).waitFor();
    const main = page.getByRole('main');
    const firstDate = main.getByRole('button', { name: /Studio One/ });
    const secondDate = main.getByRole('button', { name: /Studio Two/ });
    assert.equal(await firstDate.getAttribute('aria-pressed'), 'true');
    const chooseSecond = async () => {
      await secondDate.click();
      assert.equal(await secondDate.getAttribute('aria-pressed'), 'true');
      await page.waitForURL((url) => url.searchParams.get('performance') === 'second');
    };
    await chooseSecond();
    const buy = main.getByRole('link', { name: 'Buy tickets' });
    await buy.click();
    await page.waitForURL((url) => url.pathname === performanceUrl + '/waiting-room');
    await page.getByRole('heading', { name: 'River Tour', exact: true }).waitFor();
    await page.getByText(/Studio Two/).waitFor();
    await page.getByRole('button', { name: 'Leave the queue' }).click();
    await page.waitForURL((url) => url.pathname === eventUrl);
    admit = true;
    await chooseSecond();
    await buy.click();
    await page.waitForURL((url) => url.pathname === performanceUrl + '/tickets');
    await page.getByRole('heading', { name: 'Choose tickets', exact: true }).waitFor();
    assert.deepEqual(legacyPerformanceReads, [], 'Native performances never load legacy concert data.');
    assert.equal(detailReads, 0, 'Initial load must avoid seat detail requests');
    // Without a usable map the list stays an equivalent keyboard route, behind the List tab on phones.
    const listTab = page.getByRole('tab', { name: 'List' });
    await listTab.focus();
    await page.keyboard.press('Enter');
    assert.equal(await listTab.getAttribute('aria-selected'), 'true');
    await page.getByRole('button', { name: 'View seats' }).focus();
    await page.keyboard.press('Enter');
    const seat = page.getByRole('button', { name: 'Row A, seat 12' });
    await seat.waitFor();
    assert.ok(detailReads > 0);
    await seat.focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Continue to checkout' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Continue to checkout' }).isEnabled(), true);
    await page.getByRole('button', { name: 'Continue to checkout' }).click();
    await page.waitForURL('**/checkout?orderId=seat-order');
    assert.equal(released, 0, 'Checkout keeps the hold.');
    await page.getByText('Balcony · Row A, seat 12', { exact: false }).waitFor();
    await page.goto(origin + '/concerts/first');
    await page.getByRole('heading', { name: 'Legacy River Show', exact: true }).waitFor();
    console.log('Performance schedule, section loading, keyboard fallback and legacy route passed.');
  } catch (error) {
    const output = '.artifacts/e2e/seating';
    await mkdir(output, { recursive: true });
    await context.tracing.stop({ path: `${output}/buyer-trace.zip` });
    console.error(await page.locator('body').innerText({ timeout: 2000 }));
    throw error;
  }
} finally {
  await browser.close();
}
