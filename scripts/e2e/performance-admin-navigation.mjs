import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18105';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use an isolated loopback deployment');
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 1440, height: 900 } });
const run = randomUUID().slice(0, 8);

async function api(path, data, { token, organization, method = 'POST' } = {}) {
  const response = await context.request.fetch(path, {
    method,
    data,
    headers: {
      ...(token && { Authorization: 'Bearer ' + token }),
      ...(organization && { 'X-Organization-Id': organization }),
    },
  });
  assert.ok(response.ok(), method + ' ' + path + ' returned ' + response.status());
  return (await response.json()).data;
}

try {
  const admin = await api('/api/auth/login', { email: 'admin@ticketbox.com', password: 'password123' });
  const organizer = await api('/api/auth/login', { email: 'organizer@ticketbox.com', password: 'password123' });
  assert.deepEqual(await api('/api/organizations', undefined, { token: admin.accessToken, method: 'GET' }), []);
  const owner = await api('/api/admin/organizations', {
    name: 'Seat editor ' + run, initialManagerId: organizer.user.id,
  }, { token: admin.accessToken });
  const denied = await context.request.get('/api/organizer/manage/v2/events', {
    headers: { Authorization: 'Bearer ' + admin.accessToken, 'X-Organization-Id': owner.id },
  });
  assert.equal(denied.status(), 403);
  await context.addCookies([{ name: 'ticketbox_auth_token', value: admin.accessToken, url: baseURL }]);

  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto('/admin/ticket-types');
  const concertNavigation = page.getByRole('navigation', { name: 'Concert navigation' });
  await concertNavigation.getByRole('link', { name: 'All concerts', exact: true }).waitFor();
  await page.locator('.admin-page-actions').getByRole('link', { name: 'Concert workspace' }).click();
  await page.waitForURL('**/admin/concerts');
  await concertNavigation.getByRole('link', { name: 'Event review', exact: true }).click();
  await page.waitForURL('**/admin/event-review');
  await concertNavigation.getByRole('link', { name: 'Performance operations', exact: true }).click();
  await page.waitForURL('**/admin/performance-operations');
  await page.goBack();
  await page.waitForURL('**/admin/event-review');
  await concertNavigation.getByRole('link', { name: 'Event review', exact: true })
    .and(concertNavigation.locator('[aria-current="page"]')).waitFor();
  await page.getByRole('navigation', { name: 'Management navigation' }).getByRole('link', { name: 'Organizations', exact: true }).click();
  await page.waitForURL('**/admin/organizations');

  await context.addCookies([{ name: 'ticketbox_auth_token', value: organizer.accessToken, url: baseURL }]);
  await page.addInitScript(({ accountId, organizationId }) => sessionStorage.setItem(`ticketbox.organization.${accountId}`, organizationId),
    { accountId: organizer.user.id, organizationId: owner.id });
  await page.goto('/organizer/events');
  await page.getByRole('heading', { name: 'Your events', exact: true }).waitFor();
  const title = 'Seating event ' + run;
  await concertNavigation.getByRole('link', { name: 'Create concert' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  const eventPath = new URL(page.url()).pathname;
  const eventId = eventPath.split('/').at(-1);
  const manage = { token: organizer.accessToken, organization: owner.id };
  const venue = await api('/api/organizer/manage/v2/venues', { name: 'Fixture hall', address: 'Test street', spaceName: 'Hall' }, manage);
  const date = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();
  await api('/api/organizer/manage/v2/events/' + eventId + '/performances', {
    venueSpaceId: venue.spaces[0].id, startsAt: date(48), endsAt: date(50), timezone: 'Asia/Ho_Chi_Minh',
    saleStartAt: date(-1), saleEndAt: date(24), maxPerAccount: 4, publicVisible: true,
  }, manage);
  await page.reload();
  await page.getByRole('button', { name: 'Reserved seats', exact: true }).click();
  await page.getByRole('button', { name: 'Add seating map' }).click();
  const canvas = page.getByRole('region', { name: 'Venue layout' });
  await canvas.getByText('Import or reuse a map', { exact: true }).click();
  await canvas.getByLabel('Import interactive SVG').waitFor();

  console.log('Platform concert links stay in Admin without an organization. Organizer concert management requires organization access.');
} finally {
  await browser.close();
}
