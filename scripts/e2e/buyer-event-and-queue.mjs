import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.TICKETBOX_BUYER_URL || 'http://localhost:5185').origin;
const buyer = { id: 'buyer', email: 'buyer@example.test', fullName: 'Fixture Buyer', role: 'AUDIENCE' };
const organizer = { ...buyer, id: 'organizer', role: 'ORGANIZER' };
const tokenFor = (user) => `fixture.${Buffer.from(JSON.stringify({
  ...user, sub: user.id, exp: Math.floor(Date.now() / 1_000) + 3_600,
})).toString('base64url')}.fixture`;
const timestamp = (minutes = 0) => new Date(Date.now() + minutes * 60_000).toISOString();
const eventId = 'purchase-fixture';
const eventPath = `/concerts/${eventId}`;
const eventTitle = 'A Night of Chamber Music at the Riverside Theatre';
const detail = {
  id: eventId, title: eventTitle, description: 'A fixture concert.', artistBio: null,
  venueName: 'Riverside Theatre', venueAddress: '32 Sample Street', eventDate: timestamp(1_440),
  status: 'ON_SALE', saleStartAt: timestamp(-30), saleEndAt: timestamp(60), doorsOpenAt: null,
  posterUrl: null, seatMapSvg: null, organizationName: 'Riverside Arts',
  ticketTypes: [{
    id: 'balcony', concertId: eventId, name: 'Balcony', price: 350_000, availableQty: 20,
    totalQuantity: 20, maxPerAccount: 4, isActive: true,
  }],
};

const status = (value, fields = {}) => ({
  status: value, position: null, peopleAhead: null, estimatedWaitSeconds: null,
  queueAccessToken: null, sessionExpiresAt: null, waitingRoomCount: 10, queueSize: 10,
  activeShoppers: 2, ...fields,
});
const waiting = status('WAITING', { position: 4, peopleAhead: 3 });

const browser = await chromium.launch();
async function fixture(user) {
  const context = await browser.newContext({
    baseURL: origin, locale: 'en-US', viewport: { width: 390, height: 844 },
  });
  if (user) await context.addCookies([{ name: 'ticketbox_auth_token', value: tokenFor(user), url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(6_000);
  await page.clock.install();
  const state = { user, event: detail, queue: waiting, previews: 0, joins: 0, polls: 0, mockSocket: false,
    socketOpens: 0, socketCloses: 0, socketSubscriptions: 0, leaves: 0 };
  const emptyPage = { content: [], number: 0, last: true, totalPages: 0 };

  await page.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== origin) return route.abort();
    const path = url.pathname;
    if (path === '/ws/info') {
      return route.fulfill(state.mockSocket
        ? { json: { websocket: true, cookie_needed: false, origins: ['*:*'], entropy: 1 } }
        : { status: 503, body: 'Realtime fixture unavailable' });
    }
    if (!path.startsWith('/api/')) return route.continue();
    const reply = (data, code = 200) => route.fulfill({ status: code, json: { code, data, message: 'Fixture' } });
    if (path === '/api/auth/me') return reply(state.user);
    if (path === '/api/auth/login') {
      state.user = buyer;
      return reply({ user: buyer, accessToken: tokenFor(buyer) });
    }
    if (path === '/api/notifications/unread-count') return reply({ count: 0 });
    if (path === '/api/organizations') return reply([{ id: 'riverside-arts', name: 'Riverside Arts', grants: ['EVENTS'] }]);
    if (path === `/api/organizer/manage/concerts/${eventId}/preview`) {
      assert.equal(route.request().headers()['x-organization-id'], 'riverside-arts');
      state.previews++;
      return reply(state.event);
    }
    if (path === '/api/concerts') return reply(emptyPage);
    if (path === `/api/concerts/${eventId}`) return reply(state.event, state.event ? 200 : 404);
    if (path === `/api/concerts/${eventId}/ticket-types`) return reply(state.event.ticketTypes);
    if (path === `/api/concerts/${eventId}/availability`) return reply({
      concertId: eventId,
      items: state.event.ticketTypes.map((type) => ({
        ticketTypeId: type.id, name: type.name, availableQty: type.availableQty, totalQuantity: type.totalQuantity,
      })),
    });
    if (path === `/api/queue/concerts/${eventId}/join`) {
      state.joins++;
      return reply(state.queue);
    }
    if (path === `/api/queue/concerts/${eventId}/status`) {
      state.polls++;
      return reply(state.queue);
    }
    if (path === `/api/queue/concerts/${eventId}/leave`) {
      state.leaves++;
      return reply(status('LEFT'));
    }
    return reply(null, 404);
  });
  await page.routeWebSocket(/\/ws\/.*\/websocket$/, (socket) => {
    state.socketOpens++;
    const send = (frame) => socket.send('a' + JSON.stringify([frame]));
    socket.send('o');
    socket.onMessage((message) => {
      for (const frame of JSON.parse(message)) {
        if (/^(CONNECT|STOMP)\n/.test(frame)) send('CONNECTED\nversion:1.2\nheart-beat:0,0\n\n\0');
        if (frame.startsWith('SEND') && frame.includes('/app/queue/subscribe')) state.socketSubscriptions++;
        if (frame.startsWith('DISCONNECT')) {
          const receipt = frame.match(/receipt:([^\n]+)/)?.[1];
          if (receipt) send('RECEIPT\nreceipt-id:' + receipt + '\n\n\0');
        }
      }
    });
    socket.onClose(() => { state.socketCloses++; });
  });
  return { context, page, state };
}

async function waitForQueueSocket({ page, state }) {
  for (let attempt = 0; attempt < 30 && !state.socketSubscriptions; attempt++) {
    await page.clock.runFor(25);
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  assert.equal(state.socketOpens, 1);
  assert.equal(state.socketSubscriptions, 1);
}

async function assertFits(page) {
  for (const width of [320, 390, 834, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
    assert(overflow <= 1, `Viewport ${width}px overflows by ${overflow}px`);
  }
  await page.setViewportSize({ width: 390, height: 844 });
}

async function signIn(page) {
  await page.waitForURL('**/login');
  await page.locator('input[name="email"]').fill(buyer.email);
  await page.locator('input[name="password"]').fill('fixture-password');
  await page.locator('button[type="submit"]').click();
}

try {
  const event = await fixture();
  const { page, state } = event;
  const content = page.getByRole('main');
  const buyNow = content.getByRole('link', { name: 'Sign in to buy' });
  const enterWaitingRoom = content.getByRole('link', { name: 'Join waiting room' });
  const salesCases = [
    [{ status: 'CANCELLED', saleStartAt: timestamp(90) }, 'Cancelled'],
    [{ status: 'SOLD_OUT' }, 'Sold out'],
    [{ status: 'COMPLETED' }, 'Sale closed'],
    [{ saleEndAt: timestamp(-1) }, 'Sale closed'],
    [{ saleStartAt: timestamp(90) }, /^Opens /],
  ];
  for (const [overrides, label] of salesCases) {
    state.event = { ...detail, ...overrides };
    await page.goto(eventPath);
    await content.getByRole('heading', { name: eventTitle }).waitFor();
    await content.getByText(label, { exact: typeof label === 'string' }).first().waitFor();
    assert.equal(await buyNow.count(), 0);
    assert.equal(await enterWaitingRoom.count(), 0);
  }
  state.event = null;
  await page.goto(eventPath);
  await content.getByRole('heading', { name: 'Event unavailable' }).waitFor();
  assert.equal(await content.getByText('Cancelled', { exact: true }).count(), 0);
  assert.equal(await buyNow.count(), 0);
  state.event = { ...detail, saleStartAt: timestamp(30) };
  await page.goto(eventPath);
  await content.getByRole('link', { name: 'Sign in to buy' }).waitFor();
  state.event = detail;
  await page.goto(eventPath);
  assert.equal(new URL(page.url()).pathname, '/events/' + eventId, 'Legacy links redirect to the event page');
  await buyNow.waitFor();
  await content.getByText('Balcony', { exact: true }).waitFor();
  await assertFits(page);
  await page.getByRole('banner').getByRole('button', { name: 'Open account menu' }).click();
  await page.getByRole('combobox', { name: 'Language' }).selectOption('vi');
  await content.getByText('Đang mở bán', { exact: true }).first().waitFor();
  await assertFits(page);
  await page.getByRole('combobox', { name: 'Ngôn ngữ' }).selectOption('en');
  await page.keyboard.press('Escape');
  await buyNow.waitFor();
  const buyBounds = await buyNow.boundingBox();
  assert(buyBounds.y + buyBounds.height <= 844, 'The primary purchase action fits in the first mobile viewport.');

  await buyNow.focus();
  await page.keyboard.press('Enter');
  await signIn(page);
  await page.waitForURL((url) => url.pathname === eventPath + '/waiting-room' && url.search === '?qty=1');
  await page.getByRole('heading', { name: "You're in line." }).waitFor();
  assert(state.joins > 0);
  await event.context.close();
  console.log('Event detail covers pre-sale, open sale, sold out, closed, cancelled and login returning to the event queue.');

  const directLogin = await fixture();
  await directLogin.page.goto('/login');
  await signIn(directLogin.page);
  await directLogin.page.waitForURL(origin + '/');
  await directLogin.context.close();

  const requestedLocation = await fixture();
  const waitingTarget = eventPath + '/waiting-room?source=event#queue';
  await requestedLocation.page.goto(waitingTarget);
  await signIn(requestedLocation.page);
  await requestedLocation.page.waitForURL(origin + waitingTarget);
  await requestedLocation.page.getByRole('heading', { name: "You're in line." }).waitFor();
  await requestedLocation.context.close();
  console.log('Direct login returns to the role home and a guarded login preserves pathname, query and fragment.');

  const preview = await fixture(organizer);
  await preview.page.goto(`/organizer${eventPath}/preview`);
  await preview.page.getByText(/^Organizer preview/).first().waitFor();
  await preview.page.getByRole('heading', { name: eventTitle }).waitFor();
  assert(preview.state.previews > 0);
  assert.equal(await preview.page.getByRole('link', { name: /Buy tickets|Join waiting room|Sign in to buy/ }).count(), 0);
  await preview.context.close();
  console.log('Organizer preview uses the scoped API and provides no purchase link.');

  const queue = await fixture(buyer);
  queue.state.event = { ...detail, saleStartAt: timestamp(1) };
  queue.state.queue = status('WAITING_ROOM');
  await queue.page.goto(eventPath + '/waiting-room');
  await queue.page.getByRole('heading', { name: eventTitle }).waitFor();
  const timer = queue.page.getByRole('timer');
  await timer.waitFor();
  assert.equal(await timer.count(), 1);
  await queue.page.getByText('Live updates are interrupted. We’re checking your place automatically.', { exact: true }).waitFor();
  queue.state.queue = waiting;
  await queue.page.clock.fastForward(61_000);
  await queue.page.getByRole('heading', { name: "You're in line." }).waitFor();
  assert.equal(await timer.count(), 0);
  await queue.page.getByText('People ahead', { exact: true }).waitFor();
  await queue.page.getByText('No wait estimate yet.', { exact: true }).waitFor();
  await assertFits(queue.page);

  queue.state.queue = { ...waiting, estimatedWaitSeconds: 125 };
  await queue.page.clock.fastForward(16_000);
  await queue.page.getByText('Estimated wait: About 3 minutes', { exact: true }).waitFor();
  queue.state.queue = status('ADMITTED', { queueAccessToken: 'expired-fixture-token', sessionExpiresAt: timestamp(-1) });
  await queue.page.clock.fastForward(16_000);
  await queue.page.getByText('We’re still checking your ticket selection access.', { exact: true }).waitFor();
  assert.equal(new URL(queue.page.url()).pathname, eventPath + '/waiting-room');
  queue.state.queue = status('ADMITTED', { queueAccessToken: 'fixture-queue-token', sessionExpiresAt: timestamp(15) });
  await queue.page.clock.fastForward(16_000);
  await queue.page.waitForURL('**' + eventPath + '/seats');
  assert(queue.state.polls > 1);
  const admission = await queue.page.evaluate(() => JSON.parse(sessionStorage.getItem('ticketbox.queue-admission')));
  assert.equal(admission.concertId, eventId);
  assert.equal(admission.queueAccessToken, 'fixture-queue-token');
  await queue.context.close();
  console.log('Waiting room switches to queue, shows known and missing estimates, and advances only after a fallback status check admits the buyer.');

  const adaptive = await fixture(buyer);
  adaptive.state.mockSocket = true;
  await adaptive.page.addInitScript(() => { Math.random = () => 0.75; });
  adaptive.state.queue = status('WAITING', { position: 20_001, peopleAhead: 20_000, pollAfterMs: 60_000 });
  await adaptive.page.goto(eventPath + '/waiting-room');
  await adaptive.page.getByText('20,000', { exact: true }).waitFor();
  adaptive.state.queue = status('WAITING', { position: 5001, peopleAhead: 5000, pollAfterMs: 20_000 });
  await adaptive.page.clock.fastForward(62_000);
  assert.equal(adaptive.state.polls, 0, 'First poll uses fresh jitter around 60 seconds.');
  assert.equal(adaptive.state.socketOpens, 0);
  await adaptive.page.clock.fastForward(6_000);
  await adaptive.page.getByText('5,000', { exact: true }).waitFor();
  adaptive.state.queue = status('WAITING', { position: 1000, peopleAhead: 999, pollAfterMs: 5_000 });
  await adaptive.page.clock.fastForward(20_000);
  assert.equal(adaptive.state.polls, 1);
  await adaptive.page.clock.fastForward(4_000);
  await adaptive.page.getByText('999', { exact: true }).waitFor();
  await waitForQueueSocket(adaptive);
  adaptive.state.queue = status('ADMITTED', { queueAccessToken: 'adaptive-token', sessionExpiresAt: timestamp(15) });
  await adaptive.page.clock.fastForward(7_000);
  await adaptive.page.waitForURL('**' + eventPath + '/seats');
  await adaptive.page.clock.fastForward(20_000);
  assert.equal(adaptive.state.polls, 3);
  assert.equal(adaptive.state.socketCloses, 1);
  await adaptive.context.close();
  console.log('Adaptive waiting uses three HTTP intervals, starts one near-front socket, and recovers a missed notification.');

  for (const leave of [true, false]) {
    const departing = await fixture(buyer);
    departing.state.mockSocket = true;
    departing.state.queue = { ...waiting, pollAfterMs: 5_000 };
    await departing.page.goto(eventPath);
    await departing.page.getByRole('main').getByRole('link', { name: 'Buy tickets' }).click();
    await departing.page.waitForURL((url) => url.pathname === eventPath + '/waiting-room');
    await departing.page.getByRole('heading', { name: "You're in line." }).waitFor();
    await waitForQueueSocket(departing);
    if (leave) {
      await departing.page.getByRole('button', { name: 'Leave the queue' }).click();
      await departing.page.waitForURL(origin + '/events/' + eventId);
    } else {
      await departing.page.goBack();
      await departing.page.waitForURL((url) => url.pathname === '/events/' + eventId);
    }
    const pollsBeforeDeparture = departing.state.polls;
    await departing.page.clock.fastForward(65_000);
    assert.equal(departing.state.polls, pollsBeforeDeparture);
    assert.equal(departing.state.socketCloses, 1);
    assert.equal(departing.state.leaves, leave ? 1 : 0);
    await departing.context.close();
  }
  console.log('Explicit leave and page navigation close the socket and cancel future polling.');

  const closed = await fixture(buyer);
  closed.state.queue = status('EXPIRED');
  await closed.page.goto(eventPath + '/waiting-room');
  await closed.page.getByRole('heading', { name: 'Your queue session ended.' }).waitFor();
  const back = closed.page.getByRole('link', { name: 'Back to event details' });
  assert.equal(await back.getAttribute('href'), eventPath);
  await back.click();
  await closed.page.waitForURL('**/events/' + eventId);
  await closed.context.close();
  console.log('An expired queue session explains what happened and links back to the correct event.');
} finally {
  await browser.close();
}
