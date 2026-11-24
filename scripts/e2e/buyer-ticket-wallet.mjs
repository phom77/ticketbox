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
const reply = (route, data, status = 200) =>
  route.fulfill({ status, json: { code: status, data, message: status === 200 ? 'OK' : 'Fixture failure' } });
await page.route((url) => url.pathname.startsWith('/api/'), (route) => {
  const { pathname } = new URL(route.request().url());
  if (pathname === '/api/auth/me') return reply(route, user);
  if (pathname === '/api/notifications/unread-count') return reply(route, { count: 0 });
  if (pathname === '/api/tickets') return reply(route, tickets);
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

ticketStatus = 503;
await page.reload();
await page.getByText('Offline copy.').waitFor();
await page.getByRole('img', { name: /Ticket QR code/ }).first().waitFor();

await page.goto(`${origin}/my-tickets/unknown-ticket`);
ticketStatus = 200;
await page.reload();
await page.getByRole('heading', { name: 'Ticket not found' }).waitFor();

await browser.close();
console.log('buyer ticket wallet fixture passed');
