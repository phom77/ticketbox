import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18105';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use an isolated loopback deployment');
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 1440, height: 900 } });
const run = randomUUID().slice(0, 8);
const settings = 'Concert workspace';

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
  const platform = await api('/api/auth/login', { email: 'admin@ticketbox.com', password: 'password123' });
  const credentials = { email: 'seat-admin-' + run + '@example.test', password: 'local-seat-admin-password-32' };
  const account = await api('/api/auth/register', { ...credentials, fullName: 'Seating administrator' });
  await api('/api/admin/users/' + account.id + '/role', { role: 'ADMIN' }, {
    method: 'PUT', token: platform.accessToken,
  });
  const admin = await api('/api/auth/login', credentials);
  const foreign = await api('/api/admin/organizations', {
    name: 'Other seating organization ' + run, initialManagerId: platform.user.id,
  }, { token: platform.accessToken });
  const denied = await context.request.get('/api/organizer/manage/v2/events', {
    headers: { Authorization: 'Bearer ' + admin.accessToken, 'X-Organization-Id': foreign.id },
  });
  assert.equal(denied.status(), 403);
  await context.addCookies([{ name: 'ticketbox_auth_token', value: admin.accessToken, url: baseURL }]);

  const page = await context.newPage();
  page.setDefaultTimeout(10_000);
  await page.goto('/admin/ticket-types');
  await page.locator('.admin-page-actions').getByRole('link', { name: settings }).click();
  await page.getByRole('heading', { name: 'Event access required' }).waitFor();
  await page.getByRole('link', { name: 'Manage organizations' }).click();
  const organization = page.locator('section').filter({ has: page.getByRole('button', { name: 'Approve organization', exact: true }) });
  const organizationName = 'Seat editor ' + run;
  await organization.getByLabel('Organization name').fill(organizationName);
  await organization.getByRole('button', { name: 'Use my account ID' }).click();
  assert.equal(await organization.getByLabel('Manager account ID', { exact: true }).inputValue(), account.id);
  await organization.getByRole('button', { name: 'Approve organization', exact: true }).click();
  await page.getByRole('listitem').filter({ hasText: organizationName }).waitFor();

  await page.locator('.operations-nav').getByRole('link', { name: settings }).click();
  await page.getByRole('heading', { name: 'Your events', exact: true }).waitFor();
  const title = 'Seating event ' + run;
  await page.getByRole('link', { name: 'Create concert' }).click();
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('heading', { name: title, exact: true }).waitFor();
  const eventPath = new URL(page.url()).pathname;
  const eventId = eventPath.split('/').at(-1);
  const owner = await api('/api/organizations', undefined, { method: 'GET', token: admin.accessToken });
  const manage = { token: admin.accessToken, organization: owner.find((entry) => entry.name === organizationName).id };
  const venue = await api('/api/organizer/manage/v2/venues', { name: 'Fixture hall', address: 'Test street', spaceName: 'Hall' }, manage);
  const date = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();
  await api('/api/organizer/manage/v2/events/' + eventId + '/performances', {
    venueSpaceId: venue.spaces[0].id, startsAt: date(48), endsAt: date(50), timezone: 'Asia/Ho_Chi_Minh',
    saleStartAt: date(-1), saleEndAt: date(24), maxPerAccount: 4, publicVisible: true,
  }, manage);
  await page.reload();
  await page.getByRole('button', { name: 'Add seating map' }).click();
  await page.getByRole('region', { name: 'Venue layout' }).getByLabel('Import interactive SVG').waitFor();
  await page.getByRole('region', { name: 'Sale configuration' }).waitFor();

  const invitation = await api('/api/organizations/' + foreign.id + '/invitations', {
    accountId: account.id, grants: ['FINANCE'],
  }, { token: platform.accessToken, organization: foreign.id });
  await api('/api/organizations/invitations/accept', { code: invitation.code }, { token: admin.accessToken });
  await page.reload();
  await page.getByLabel('Active organization').selectOption({ value: foreign.id });
  await page.goto('/organizer/events');
  await page.getByRole('heading', { name: 'Event access required' }).waitFor();
  await page.getByRole('button', { name: organizationName, exact: true }).click();
  await page.getByRole('heading', { name: 'Your events', exact: true }).waitFor();
  await page.getByRole('link', { name: new RegExp(title) }).waitFor();

  console.log('Platform navigation exposes concert management after explicit organization access. Cross-organization requests stay denied.');
} finally {
  await browser.close();
}
