import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://127.0.0.1:5189';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname));
const organization = { id: '33c358c1-fa83-46c9-b98d-60391347e57b', name: 'Sunroom Live', grants: ['EVENTS'] };
const event = {
  id: '6f15ac1d-1201-4ac1-8c1e-286c266a66c5', title: 'Arena Sessions',
  description: 'Two shows in the same hall.', category: 'Music', organizationId: organization.id,
  legacyConcertId: null, performanceCount: 1, preparing: true, changesRequested: true,
  nextStartsAt: null, actionPerformanceId: '0f87425e-dc18-4d73-a3f0-3c5db2996dfe',
  changeReason: 'Confirm the accessible seating layout.',
};
const legacy = { ...event, id: '289d2ef6-22d4-47ba-981e-1b8fdb8e8273',
  legacyConcertId: 'ac6511c9-aa3c-4842-8058-bfddd37c47fa', title: 'Legacy Concert', changesRequested: false };
const row = {
  id: event.actionPerformanceId, eventId: event.id, title: event.title, organizationId: organization.id,
  legacyConcertId: null, venueName: 'Landmark Arena', spaceName: 'Main Hall',
  startsAt: '2026-12-15T13:00:00Z', endsAt: '2026-12-15T15:00:00Z', timezone: 'Asia/Ho_Chi_Minh',
  status: 'DRAFT', salesSuspended: false, publicVisible: false, saleStartAt: null, saleEndAt: null,
  publicationStatus: 'CHANGES_REQUESTED', ticketingAcknowledged: null, checkinAcknowledged: null,
};
const pageOf = (content) => ({ content, totalElements: content.length, totalPages: 1, number: 0, size: 20 });
const browser = await chromium.launch();

async function session(role, { empty = false } = {}) {
  const context = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 1440, height: 900 } });
  const user = { id: 'ba1f50be-9db1-4bb4-9135-b94bad4490fd', role, email: 'fixture@example.test', fullName: 'Fixture User' };
  const payload = Buffer.from(JSON.stringify({ ...user, sub: user.id, exp: Date.now() / 1000 + 300 })).toString('base64url');
  await context.addCookies([{ name: 'ticketbox_auth_token', value: 'fixture.' + payload + '.fixture', url: baseURL }]);
  await context.route((url) => url.pathname.startsWith('/api/'), (route) => {
    const url = new URL(route.request().url());
    const { pathname } = url;
    let data;
    if (pathname === '/api/auth/me') data = user;
    else if (pathname === '/api/organizations' || pathname === '/api/admin/organizations') data = [organization];
    else if (pathname === '/api/admin/v2/events' || pathname === '/api/organizer/manage/v2/event-directory') {
      data = pageOf(empty || url.searchParams.get('query') ? []
        : url.searchParams.get('status') === 'CHANGES_REQUESTED' ? [event] : [event, legacy]);
    } else if (pathname === '/api/admin/v2/events/' + event.id) data = { ...event, performances: [row] };
    else return route.fulfill({ status: 404, json: { message: 'Unexpected fixture request ' + pathname } });
    return route.fulfill({ json: { code: 200, data } });
  });
  const page = await context.newPage();
  page.setDefaultTimeout(5000);
  return page;
}

try {
  const admin = await session('ADMIN');
  await admin.goto('/admin/events');
  await admin.locator('main').getByRole('link', { name: 'Arena Sessions', exact: true }).click();
  assert.equal(new URL(admin.url()).pathname, '/admin/events/' + event.id);
  await admin.getByRole('heading', { name: 'Arena Sessions', exact: true }).waitFor();
  await admin.getByText('Sunroom Live', { exact: true }).first().waitFor();
  await admin.locator('main').getByRole('link', { name: 'Open review', exact: true }).click();
  const review = new URL(admin.url());
  assert.equal(review.pathname, '/admin/event-review');
  assert.equal(review.searchParams.get('performanceId'), row.id);
  await admin.goBack();
  await admin.getByRole('heading', { name: 'Arena Sessions', exact: true }).waitFor();
  await admin.goto('/admin/events');
  assert.equal(await admin.locator('main').getByRole('link', { name: 'Legacy Concert', exact: true }).getAttribute('href'),
    '/admin/concerts/' + legacy.legacyConcertId);

  const organizer = await session('ORGANIZER');
  await organizer.goto('/organizer/events?status=CHANGES_REQUESTED');
  await organizer.getByText(event.changeReason, { exact: true }).waitFor();
  assert.equal(await organizer.locator('main').getByRole('link', { name: 'Arena Sessions', exact: true }).getAttribute('href'),
    '/organizer/events/' + event.id + '?show=' + row.id + '&step=review');
  assert.equal(await organizer.getByRole('link', { name: 'Legacy Concert', exact: true }).count(), 0);
  await organizer.goto('/organizer/events');
  assert.equal(await organizer.locator('main').getByRole('link', { name: 'Legacy Concert', exact: true }).getAttribute('href'),
    '/organizer/concerts/' + legacy.legacyConcertId);
  await organizer.getByRole('searchbox', { name: 'Search concerts' }).fill('No matching title');
  await organizer.getByRole('button', { name: 'Apply', exact: true }).click();
  await organizer.getByRole('heading', { name: 'No matching concerts', exact: true }).waitFor();
  await organizer.getByRole('link', { name: 'Clear filters' }).click();
  await organizer.locator('main').getByRole('link', { name: 'Legacy Concert', exact: true }).waitFor();
  const newOrganization = await session('ORGANIZER', { empty: true });
  await newOrganization.goto('/organizer/events');
  await newOrganization.getByRole('heading', { name: 'No concerts yet', exact: true }).waitFor();
  await newOrganization.locator('main').getByRole('link', { name: 'Create concert', exact: true }).waitFor();
  console.log('Concert directory preserves workspace, owner, review and legacy destinations.');
} finally {
  await browser.close();
}
