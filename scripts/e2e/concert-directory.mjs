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

async function verifyNavigationRails(page, workspace) {
  await page.goto(`/${workspace}/events`);
  const mainNav = page.getByRole('navigation', { name: 'Management navigation' });
  const concertNav = page.getByRole('navigation', { name: 'Concert navigation' });
  const mainCollapse = page.getByRole('button', { name: 'Collapse main sidebar' });
  const mainExpand = page.getByRole('button', { name: 'Expand main sidebar' });
  const concertCollapse = page.getByRole('button', { name: 'Collapse Concert sidebar' });
  const concertExpand = page.getByRole('button', { name: 'Expand Concert sidebar' });
  const concert = mainNav.getByRole('button', { name: 'Concert', exact: true });
  const allConcerts = concertNav.getByRole('link', { name: 'All concerts' });

  await mainCollapse.waitFor();
  const { width: primaryWidth } = await mainNav.boundingBox();
  const { width: concertWidth } = await concertNav.boundingBox();
  const { width: contentWidth } = await page.getByRole('main').boundingBox();

  await mainCollapse.focus();
  await mainCollapse.press('Enter');
  assert.equal(await mainExpand.getAttribute('aria-expanded'), 'false');
  assert(await mainExpand.evaluate((node) => node === document.activeElement && node.matches(':focus-visible')));
  assert((await mainNav.boundingBox()).width < primaryWidth / 2);
  assert.equal((await concertNav.boundingBox()).width, concertWidth);
  assert.equal(await concert.getAttribute('title'), 'Concert');
  assert.equal(await concert.getByText('Concert', { exact: true }).isVisible(), false);

  await concertCollapse.focus();
  await concertCollapse.press('Space');
  assert.equal(await concertExpand.getAttribute('aria-expanded'), 'false');
  assert(await concertExpand.evaluate((node) => node === document.activeElement && node.matches(':focus-visible')));
  assert((await concertNav.boundingBox()).width < concertWidth / 2);
  assert((await page.getByRole('main').boundingBox()).width > contentWidth);
  assert.equal(await allConcerts.getAttribute('aria-current'), 'page');
  assert.equal(await allConcerts.getAttribute('title'), 'All concerts');
  assert.equal(await allConcerts.getByText('All concerts', { exact: true }).isVisible(), false);

  await concert.press('Enter');
  assert.equal(await concert.getAttribute('aria-expanded'), 'false');
  assert.equal(await concertNav.isVisible(), false);
  await concert.press('Enter');
  await concertExpand.waitFor();

  await page.reload();
  await mainExpand.waitFor();
  await concertExpand.waitFor();
  await mainExpand.click();
  assert.equal((await mainNav.boundingBox()).width, primaryWidth);
  assert((await concertNav.boundingBox()).width < concertWidth / 2);
  await mainCollapse.click();

  for (const width of [834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    const menu = page.getByRole('button', { name: 'Open navigation' });
    await menu.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Management navigation' });
    await allConcerts.getByText('All concerts', { exact: true }).waitFor();
    assert.equal(await dialog.getByRole('button', { name: /sidebar/ }).count(), 0);
    await dialog.getByRole('button', { name: 'Back to main navigation' }).press('Enter');
    await concert.getByText('Concert', { exact: true }).waitFor();
    await page.keyboard.press('Escape');
    await dialog.waitFor({ state: 'hidden' });
    assert(await menu.evaluate((node) => document.activeElement === node));
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  }

  await page.setViewportSize({ width: 1440, height: 900 });
  await mainExpand.waitFor();
  await concertExpand.click();
  assert.equal((await concertNav.boundingBox()).width, concertWidth);
  assert((await mainNav.boundingBox()).width < primaryWidth / 2);
  await mainExpand.click();
}

try {
  const admin = await session('ADMIN');
  await verifyNavigationRails(admin, 'admin');
  await admin.goto('/admin/events');
  await admin.locator('main').getByRole('link', { name: 'Arena Sessions', exact: true }).click();
  assert.equal(new URL(admin.url()).pathname, '/admin/events/' + event.id);
  await admin.getByRole('heading', { name: 'Arena Sessions', exact: true }).waitFor();
  await admin.getByText('Sunroom Live', { exact: true }).first().waitFor();
  await admin.getByRole('button', { name: 'Collapse Concert sidebar' }).click();
  const context = admin.getByRole('group', { name: 'Arena Sessions' });
  const overview = context.getByRole('link', { name: 'Overview', exact: true });
  assert.equal(await overview.getAttribute('aria-current'), 'page');
  assert.equal(await overview.getByText('Overview', { exact: true }).isVisible(), false);
  const openReview = context.getByRole('link', { name: 'Open review', exact: true });
  assert.equal(await openReview.getAttribute('title'), 'Open review');
  await openReview.press('Enter');
  const review = new URL(admin.url());
  assert.equal(review.pathname, '/admin/event-review');
  assert.equal(review.searchParams.get('performanceId'), row.id);
  await admin.goBack();
  await admin.getByRole('heading', { name: 'Arena Sessions', exact: true }).waitFor();
  await admin.goto('/admin/events');
  assert.equal(await admin.locator('main').getByRole('link', { name: 'Legacy Concert', exact: true }).getAttribute('href'),
    '/admin/concerts/' + legacy.legacyConcertId);

  const organizer = await session('ORGANIZER');
  await verifyNavigationRails(organizer, 'organizer');
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
  console.log('Concert directory preserves workspace, owner, review and legacy destinations. Desktop rails, persistence and mobile navigation passed.');
} finally {
  await browser.close();
}
