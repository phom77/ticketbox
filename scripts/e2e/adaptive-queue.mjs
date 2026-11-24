import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = new URL(process.env.TICKETBOX_BUYER_URL || 'http://localhost:5185').origin;
const buyer = { id: 'buyer', email: 'buyer@example.test', fullName: 'Fixture Buyer', role: 'AUDIENCE' };
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
async function fixture(queue, mockSocket = true) {
  const context = await browser.newContext({
    baseURL: origin, locale: 'en-US', viewport: { width: 390, height: 844 },
  });
  await context.addCookies([{ name: 'ticketbox_auth_token', value: tokenFor(buyer), url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(6_000);
  await page.clock.install();
  await page.addInitScript(() => { Math.random = () => 0.75; });
  const state = { queue, mockSocket, polls: 0, socketOpens: 0, socketCloses: 0, socketSubscriptions: 0, leaves: 0 };
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
    if (path === '/api/auth/me') return reply(buyer);
    if (path === '/api/notifications/unread-count') return reply({ count: 0 });
    if (path === '/api/concerts') return reply(emptyPage);
    if (path === `/api/concerts/${eventId}`) return reply(detail);
    if (path === `/api/concerts/${eventId}/ticket-types`) return reply(detail.ticketTypes);
    if (path === `/api/concerts/${eventId}/availability`) return reply({ concertId: eventId, items: [] });
    if (path === `/api/queue/concerts/${eventId}/join`) {
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


const queuePath = eventPath + '/waiting-room';
const rank = (position, pollAfterMs) => status('WAITING', { position, peopleAhead: position - 1, pollAfterMs });
const position = (page) => page.locator('.queue-orbit');

try {
  const adaptive = await fixture(rank(20_001, 60_000));
  await adaptive.page.goto(queuePath);
  await position(adaptive.page).getByText('20001', { exact: true }).waitFor();
  adaptive.state.queue = rank(5001, 20_000);
  await adaptive.page.clock.fastForward(62_000);
  assert.equal(adaptive.state.polls, 0);
  assert.equal(adaptive.state.socketOpens, 0);
  await adaptive.page.clock.fastForward(6_000);
  await position(adaptive.page).getByText('5001', { exact: true }).waitFor();
  adaptive.state.queue = rank(1000, 5_000);
  await adaptive.page.clock.fastForward(20_000);
  assert.equal(adaptive.state.polls, 1);
  await adaptive.page.clock.fastForward(4_000);
  await position(adaptive.page).getByText('1000', { exact: true }).waitFor();
  await waitForQueueSocket(adaptive);
  adaptive.state.queue = status('ADMITTED', { queueAccessToken: 'adaptive-token', sessionExpiresAt: timestamp(15) });
  await adaptive.page.clock.fastForward(7_000);
  await adaptive.page.waitForURL('**/events/' + eventId + '/tickets');
  await adaptive.page.clock.fastForward(20_000);
  assert.equal(adaptive.state.polls, 3);
  assert.equal(adaptive.state.socketCloses, 1);
  await adaptive.context.close();
  console.log('Adaptive status uses three cadences, one near-front socket, and HTTP recovery after a missed notification.');

  const legacy = await fixture(waiting, false);
  await legacy.page.goto(queuePath);
  await position(legacy.page).getByText('4', { exact: true }).waitFor();
  await legacy.page.getByText('The live queue disconnected. Reconnecting…', { exact: true }).waitFor();
  legacy.state.queue = { ...waiting, position: 3 };
  await legacy.page.clock.fastForward(12_000);
  assert.equal(legacy.state.polls, 0);
  await legacy.page.clock.fastForward(4_000);
  await position(legacy.page).getByText('3', { exact: true }).waitFor();
  assert.equal(legacy.state.polls, 1);
  await legacy.context.close();

  for (const leave of [true, false]) {
    const departing = await fixture(rank(4, 5_000));
    await departing.page.goto(eventPath);
    await departing.page.getByRole('main').getByRole('link', { name: 'Buy now' }).click();
    await departing.page.waitForURL(origin + queuePath);
    await position(departing.page).getByText('4', { exact: true }).waitFor();
    await waitForQueueSocket(departing);
    if (leave) await departing.page.getByRole('button', { name: /Details of the event/ }).click();
    else await departing.page.goBack();
    await departing.page.waitForURL(origin + eventPath);
    const pollsBeforeDeparture = departing.state.polls;
    await departing.page.clock.fastForward(65_000);
    assert.equal(departing.state.polls, pollsBeforeDeparture);
    assert.equal(departing.state.socketCloses, 1);
    assert.equal(departing.state.leaves, leave ? 1 : 0);
    await departing.context.close();
  }
  console.log('Legacy polling resumes after a socket failure. Leaving and navigating stop polling and close the socket.');
} finally {
  await browser.close();
}
