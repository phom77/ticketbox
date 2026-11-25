import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const origin = process.env.TICKETBOX_BUYER_URL || 'http://localhost:5185';
const user = { id: 'fixture-buyer', email: 'buyer@example.test', fullName: 'Khach mua ve', role: 'AUDIENCE' };
const claims = { ...user, sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 };
const token = `fixture.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.fixture`;
const payload = 'ticketbox-wallet-qr-fixture-private';
const browser = await chromium.launch();

const day = (days) => new Date(Date.now() + days * 86_400_000).toISOString();
const ticket = (id, concertId, concertTitle, startsAt, status = 'VALID', extra = {}) => ({
  id, concertId, concertTitle, status, ticketTypeId: 'ga', ticketTypeName: 'GA', issuedAt: day(-3),
  qrCode: `${payload}-${id}`, performanceId: `p-${concertId}`, eventId: `e-${concertId}`,
  performanceVenueName: 'Riverside Hall', performanceStartsAt: startsAt, ...extra,
});
const tickets = [
  ticket('soon-1', 'soon', 'Riverside concert', day(2), 'VALID', { referenceCode: 'VE-000101', sectionLabel: 'A', rowLabel: '3', seatLabel: '12' }),
  ticket('soon-2', 'soon', 'Riverside concert', day(2)),
  ticket('later-1', 'later', 'Winter show', day(40)),
  ticket('old-1', 'old', 'Last year', day(-30), 'USED'),
];

const context = await browser.newContext({ locale: 'en-US', viewport: { width: 1280, height: 900 }, acceptDownloads: true });
await context.addCookies([{ name: 'ticketbox_auth_token', value: token, url: origin }]);
const page = await context.newPage();
page.setDefaultTimeout(5000);
let ticketStatus = 200;
const transferOf = (status, role, otherPartyName) => ({
  id: 'offer-1', ticketId: 'sender-ticket', orderId: 'order-1', role, status, otherPartyName,
  concertId: 'soon', concertTitle: 'Riverside concert', eventDate: day(2), ticketTypeName: 'GA',
  venueName: 'Riverside Hall', sectionLabel: 'A', rowLabel: '3', seatLabel: '14',
  createdAt: day(-1), expiresAt: status === 'EXPIRED' ? day(-1) : day(1),
});
let pending = null;
const transfers = [
  transferOf('PENDING', 'RECEIVED', 'Sam Sender'),
  { ...transferOf('EXPIRED', 'RECEIVED', 'Old Friend'), id: 'offer-expired' },
];
const reply = (route, data, status = 200) =>
  route.fulfill({ status, json: { code: status, data, message: status === 200 ? 'OK' : 'Fixture failure' } });
await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  if (pathname === '/api/auth/me') return reply(route, user);
  if (pathname === '/api/notifications/unread-count') return reply(route, { count: 0 });
  if (pathname === '/api/tickets') return reply(route, tickets);
  if (pathname === '/api/tickets/transfers') return reply(route, transfers);
  const offer = pathname.match(/^\/api\/tickets\/transfers\/([^/]+)(?:\/(accept|decline|cancel))?$/);
  if (offer) {
    const found = transfers.find((item) => item.id === offer[1]) ?? (pending?.id === offer[1] ? pending : null);
    if (!found) return reply(route, null, 404);
    if (offer[2]) {
      found.status = { accept: 'ACCEPTED', decline: 'DECLINED', cancel: 'CANCELLED' }[offer[2]];
      if (offer[2] === 'accept') {
        found.newTicketId = 'received-1';
        tickets.push(ticket('received-1', 'soon', 'Riverside concert', day(2), 'VALID', { referenceCode: 'VE-000777' }));
        const original = tickets.find((item) => item.id === 'sender-ticket');
        if (original) original.status = 'TRANSFERRED';
      }
      if (found.ticketId === 'soon-1') pending = null;
    }
    return reply(route, found);
  }
  const state = pathname.match(/^\/api\/tickets\/([^/]+)\/transfer-state$/);
  if (state) {
    if (state[1] === 'soon-1') {
      return reply(route, pending
        ? { canTransfer: false, cutoffAt: day(2), pending }
        : { canTransfer: true, cutoffAt: day(2) });
    }
    if (state[1] === 'received-1') {
      return reply(route, { canTransfer: false, blockedReason: 'RECEIVED', receivedFromName: 'Sam Sender' });
    }
    return reply(route, { canTransfer: false, blockedReason: 'CUTOFF', cutoffAt: day(-1) });
  }
  const lookup = pathname.match(/^\/api\/tickets\/([^/]+)\/transfer-recipient$/);
  if (lookup) {
    const { email } = route.request().postDataJSON();
    return email === 'nobody@example.com'
      ? route.fulfill({ status: 404, json: { code: 404, data: null, message: 'No TicketBox account uses this email. Check the address and try again.' } })
      : reply(route, { displayName: 'Fran Friend' });
  }
  if (/^\/api\/tickets\/[^/]+\/transfers$/.test(pathname)) {
    pending = { ...transferOf('PENDING', 'SENT', 'Fran Friend'), id: 'sent-offer', ticketId: 'soon-1' };
    return reply(route, pending);
  }
  const match = pathname.match(/^\/api\/tickets\/(.+)$/);
  if (match) {
    const found = tickets.find((item) => item.id === match[1]);
    return ticketStatus === 200 ? reply(route, found, found ? 200 : 404) : reply(route, null, ticketStatus);
  }
  return reply(route, null, 404);
});

await page.goto(`${origin}/my-tickets`);
await page.getByRole('heading', { name: 'My tickets' }).waitFor();
assert.equal(await page.getByRole('article').count(), 2, 'upcoming tab lists two events');
await page.getByRole('button', { name: /^Past/ }).click();
assert.equal(await page.getByRole('article').count(), 1, 'past tab lists one event');
await page.getByRole('button', { name: /^Upcoming/ }).click();

await page.getByRole('link', { name: /VE-000101/ }).click();
await page.waitForURL('**/my-tickets/soon-1');
await page.getByRole('heading', { name: 'Riverside concert' }).waitFor();
await page.getByRole('img', { name: /Ticket QR code/ }).first().waitFor();
await page.getByText('Row', { exact: true }).waitFor();

const download = page.waitForEvent('download');
await page.getByRole('button', { name: 'Add to calendar' }).click();
assert.match((await download).suggestedFilename(), /\.ics$/);

const full = page.getByRole('button', { name: 'Show full screen' });
await full.click();
await page.getByRole('dialog').waitFor();
await page.keyboard.press('Escape');
await page.getByRole('dialog').waitFor({ state: 'detached' });
assert.equal(await full.evaluate((node) => node === document.activeElement), true, 'focus returns');

// Offer a ticket: the sender confirms the recipient's name, then can cancel before it is accepted.
const transferRegion = page.getByRole('region', { name: 'Transfer' });
await transferRegion.getByRole('button', { name: 'Transfer ticket' }).click();
await transferRegion.getByText('A ticket received this way cannot be transferred again.').waitFor();
await transferRegion.getByLabel("Friend's account email").fill('nobody@example.com');
await transferRegion.getByRole('button', { name: 'Continue' }).click();
await transferRegion.getByText('No TicketBox account uses this email', { exact: false }).waitFor();
await transferRegion.getByLabel("Friend's account email").fill('friend@example.com');
await transferRegion.getByRole('button', { name: 'Continue' }).click();
await transferRegion.getByRole('heading', { name: 'Send this ticket to Fran Friend?' }).waitFor();
await transferRegion.getByRole('button', { name: 'Send ticket' }).click();
await transferRegion.getByText('Transfer pending').waitFor();
await transferRegion.getByText('Waiting for Fran Friend to accept', { exact: false }).waitFor();
await transferRegion.getByRole('button', { name: 'Cancel transfer' }).click();
await transferRegion.getByRole('button', { name: 'Transfer ticket' }).waitFor();

// A closed window explains itself instead of offering the action.
await page.goto(`${origin}/my-tickets/soon-2`);
await page.getByText('Transfers closed on', { exact: false }).waitFor();
assert.equal(await page.getByRole('button', { name: 'Transfer ticket' }).count(), 0, 'no action after cut-off');

// The recipient sees the offer in the wallet, accepts it and holds a new ticket without a Transfer action.
tickets.push(ticket('sender-ticket', 'soon', 'Riverside concert', day(2), 'VALID'));
await page.goto(`${origin}/my-tickets`);
await page.getByRole('heading', { name: '1 ticket offer for you' }).waitFor();
await page.getByRole('link', { name: 'Review offer' }).click();
await page.waitForURL('**/my-tickets/transfers/offer-1');
await page.getByRole('heading', { name: 'Riverside concert' }).waitFor();
await page.getByRole('button', { name: 'Accept ticket' }).click();
await page.getByText('The ticket is yours.', { exact: false }).waitFor();
await page.getByRole('link', { name: 'View ticket' }).click();
await page.waitForURL('**/my-tickets/received-1');
await page.getByText('Received from Sam Sender').waitFor();
assert.equal(await page.getByRole('button', { name: 'Transfer ticket' }).count(), 0, 'received tickets cannot be re-transferred');
await page.goto(`${origin}/my-tickets/sender-ticket`);
await page.getByText('Transferred').first().waitFor();

// An offer that was not accepted in time is closed.
await page.goto(`${origin}/my-tickets/transfers/offer-expired`);
await page.getByText('This offer expired before it was accepted.').waitFor();
assert.equal(await page.getByRole('button', { name: 'Accept ticket' }).count(), 0, 'expired offers cannot be accepted');

ticketStatus = 503;
await page.goto(`${origin}/my-tickets/soon-1`);
await page.reload();
await page.getByText('Offline copy.').waitFor();
await page.getByRole('img', { name: /Ticket QR code/ }).first().waitFor();

await page.goto(`${origin}/my-tickets/unknown-ticket`);
ticketStatus = 200;
await page.reload();
await page.getByRole('heading', { name: 'Ticket not found' }).waitFor();

await browser.close();
console.log('buyer ticket wallet fixture passed');
