import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import { selectWorkspaceOption } from './select-workspace-option.mjs';

const baseURL = process.env.TICKETBOX_DASHBOARD_URL ?? 'http://127.0.0.1:5187';
const output = process.env.E2E_REPORT_DIRECTORY;
const refund = 'PENDING_REFUND';
const legacy = 'legacy-show';
const show = 'evening-show';
const startsAt = '2026-11-25T12:00:00Z';
const review = {
  id: 'review-1', revision: 'revision-1', model: 'LEGACY', eventId: 'legacy-event', performanceId: 'legacy-performance',
  legacyConcertId: legacy, organizationId: 'alpha', title: 'Legacy show awaiting review', status: 'SUBMITTED',
  submittedAt: '2026-11-20T12:00:00Z', publishAt: '2026-11-22T12:00:00Z', reason: null,
};
const draft = {
  id: 'draft-event', title: 'Alpha draft', description: '', category: 'MUSIC', organizationId: 'alpha',
  legacyConcertId: null, performanceCount: 1, preparing: true, changesRequested: false,
  nextStartsAt: startsAt, actionPerformanceId: show, changeReason: null,
};
const revision = {
  ...draft, id: 'revision-event', title: 'Alpha corrections', preparing: false, changesRequested: true,
  actionPerformanceId: 'revision-show', changeReason: 'Confirm venue capacity.',
};
const performance = {
  id: show, eventId: 'summer-event', title: 'Summer show', organizationId: 'alpha', legacyConcertId: null,
  venueName: 'Community Hall', spaceName: 'Main Hall', startsAt, endsAt: '2026-11-25T14:00:00Z',
  timezone: 'Asia/Ho_Chi_Minh', status: 'ON_SALE', salesSuspended: false, publicVisible: true,
  saleStartAt: '2026-11-20T12:00:00Z', saleEndAt: '2026-11-25T12:00:00Z', publicationStatus: 'PUBLISHED',
  ticketingAcknowledged: true, checkinAcknowledged: true,
};
const memberships = [
  { id: 'alpha', name: 'Alpha Events', grants: ['EVENTS', 'FINANCE'] },
  { id: 'beta', name: 'Beta Events', grants: ['EVENTS'] },
  { id: 'finance', name: 'Finance only', grants: ['FINANCE'] },
];

const browser = await chromium.launch();

function respond(route, data, status = 200) {
  return route.fulfill({ status, json: { code: status, data } });
}

function pageResult(url, rows, totalElements) {
  const size = Number(url.searchParams.get('size') ?? 10);
  return { content: rows, totalElements, totalPages: Math.ceil(totalElements / size), size, number: 0, page: 0 };
}

async function session(role) {
  const context = await browser.newContext({
    baseURL, locale: 'en-US', colorScheme: role === 'ADMIN' ? 'light' : 'dark', viewport: { width: 1440, height: 900 },
  });
  const user = { id: 'dashboard-user', email: 'dashboard@example.test', fullName: 'Dashboard user', role };
  const payload = Buffer.from(JSON.stringify({ ...user, sub: user.id, exp: Math.floor(Date.now() / 1000) + 600 })).toString('base64url');
  await context.addCookies([{ name: 'ticketbox_auth_token', value: `header.${payload}.fixture`, url: baseURL }]);
  await context.route((url) => url.origin !== new URL(baseURL).origin, (route) => route.abort());
  const page = await context.newPage();
  page.setDefaultTimeout(4500);
  await page.route((url) => url.pathname.startsWith('/api/'), (route) => respond(route, null, 404));
  await page.route('**/api/auth/me', (route) => respond(route, user));
  return { context, page };
}

async function metric(page, name, count, href) {
  const link = page.getByRole('link', { name: new RegExp(`^${name} ${count}$`) });
  await link.waitFor();
  const target = new URL(await link.getAttribute('href'), baseURL);
  if (href) assert.equal(target.pathname + target.search, href);
  return { link, target };
}

async function verifyWidths(page, name) {
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${name} at ${width}px`);
    if (output) await page.screenshot({ path: `${output}/${name}-${width}.png`, animations: 'disabled', fullPage: true });
  }
}

async function adminDashboard() {
  const { context, page } = await session('ADMIN');
  let allowReview;
  const reviewReady = new Promise((resolve) => { allowReview = resolve; });
  let saleUnavailable = true;
  let upcomingRequest;
  await page.route('**/api/admin/v2/review-directory?*', async (route) => {
    await reviewReady;
    await respond(route, pageResult(new URL(route.request().url()), [review], 38));
  });
  await page.route('**/api/admin/v2/operations-report?*', (route) => {
    const url = new URL(route.request().url());
    if (url.searchParams.get('status') === 'ON_SALE_NOW') {
      return saleUnavailable ? respond(route, null, 503) : respond(route, pageResult(url, [], 0));
    }
    upcomingRequest = url;
    return respond(route, pageResult(url, [performance], 26));
  });
  await page.route('**/api/admin/orders/support/queue?*', (route) => {
    const url = new URL(route.request().url());
    return respond(route, url.searchParams.get('kind') === refund ? pageResult(url, [{
      orderId: 'order-to-check', sourceId: 'refund-1', state: 'RECONCILIATION_REQUIRED', updatedAt: startsAt, retryable: false,
    }], 27) : pageResult(url, [], 0));
  });

  await page.goto('/admin');
  const needsReview = page.getByRole('region', { name: 'Awaiting review', exact: true });
  await needsReview.getByRole('status').filter({ hasText: 'Loading' }).waitFor();
  const { target } = await metric(page, 'Next seven days', 26);
  assert.equal(target.pathname, '/admin/reports');
  for (const key of ['status', 'from', 'to', 'asOf']) {
    assert.ok(target.searchParams.has(key), `Upcoming report is missing ${key}`);
    assert.equal(target.searchParams.get(key), upcomingRequest.searchParams.get(key));
  }
  assert.equal(Date.parse(target.searchParams.get('to')) - Date.parse(target.searchParams.get('from')), 7 * 86400000);
  assert.equal(await page.getByRole('link', { name: 'Summer show', exact: true }).getAttribute('href'), '/admin/events/summer-event?show=evening-show');
  const onSale = page.getByRole('region', { name: 'On sale now', exact: true });
  await onSale.getByRole('alert').waitFor();
  saleUnavailable = false;
  await onSale.getByRole('button', { name: 'Try again' }).press('Enter');
  assert.equal((await metric(page, 'On sale now', 0)).target.searchParams.get('status'), 'ON_SALE_NOW');

  allowReview();
  await metric(page, 'Awaiting review', 38, '/admin/event-review?state=SUBMITTED');
  assert.equal(await page.getByRole('link', { name: review.title, exact: true }).getAttribute('href'), '/admin/concerts/legacy-show');
  const supportLink = await metric(page, 'Refund pending', 27, '/admin/orders?support=PENDING_REFUND');
  assert.equal(await page.locator('.operations-shell').getAttribute('data-theme'), 'light');
  await verifyWidths(page, 'admin-dashboard');
  await supportLink.link.press('Enter');
  await page.waitForURL('**/admin/orders?support=PENDING_REFUND');
  const queue = page.getByRole('region', { name: 'Cases that need attention', exact: true });
  await queue.getByRole('link', { name: 'order-to-check' }).waitFor();
  assert.equal(await queue.getByRole('link', { name: 'order-to-check' }).getAttribute('href'), '/admin/orders?orderId=order-to-check');
  await page.getByRole('link', { name: 'Look up orders', exact: true }).click();
  assert.equal(await page.getByRole('link', { name: 'Browse support queues', exact: true }).getAttribute('href'), '/admin/orders?support=UNKNOWN_PAYMENT');
  await page.goto('/admin');
  const upcoming = await metric(page, 'Next seven days', 26);
  await upcoming.link.click();
  await page.getByRole('heading', { name: 'Operational report', exact: true }).waitFor();
  await page.getByRole('status').filter({ hasText: '26 performances' }).waitFor();
  assert.equal(new URL(page.url()).search, upcoming.target.search);
  await context.close();
}

async function organizerDashboard() {
  const { context, page } = await session('ORGANIZER');
  await page.route('**/api/organizations', (route) => respond(route, memberships));
  let allowLate;
  let markLate;
  let finishLate;
  const lateResponse = new Promise((resolve) => { allowLate = resolve; });
  const lateRequest = new Promise((resolve) => { markLate = resolve; });
  const lateSettled = new Promise((resolve) => { finishLate = resolve; });
  let scopedReads = 0;
  await page.route('**/api/organizer/manage/v2/operations-report?*', async (route) => {
    const url = new URL(route.request().url());
    const organization = route.request().headers()['x-organization-id'];
    scopedReads++;
    if (organization === 'alpha' && url.searchParams.get('status') === 'UPCOMING') {
      markLate();
      await lateResponse;
      await respond(route, pageResult(url, [performance], 26)).catch(() => {});
      finishLate();
      return;
    }
    assert.ok(['alpha', 'beta'].includes(organization), `Unexpected operations access for ${organization}`);
    await respond(route, pageResult(url, [], 0));
  });
  await page.route('**/api/organizer/manage/v2/event-directory?*', (route) => {
    const url = new URL(route.request().url());
    const organization = route.request().headers()['x-organization-id'];
    scopedReads++;
    if (organization === 'beta') return respond(route, pageResult(url, [], 0));
    assert.equal(organization, 'alpha');
    return url.searchParams.get('status') === 'CHANGES_REQUESTED'
      ? respond(route, pageResult(url, [revision], 1))
      : respond(route, pageResult(url, [draft], 31));
  });
  await page.goto('/organizer');
  await metric(page, 'In preparation', 31, '/organizer/events?status=PREPARING');
  await metric(page, 'Changes requested', 1, '/organizer/events?status=CHANGES_REQUESTED');
  assert.equal(await page.getByRole('link', { name: 'Create concert', exact: true }).getAttribute('href'), '/organizer/events/new');
  assert.equal(await page.getByRole('link', { name: draft.title }).getAttribute('href'), '/organizer/events/draft-event?show=evening-show');
  assert.equal(await page.getByRole('link', { name: revision.title }).getAttribute('href'), '/organizer/events/revision-event?show=revision-show&step=review');
  await page.getByText(revision.changeReason, { exact: true }).waitFor();
  await lateRequest;
  assert.equal(await page.locator('.operations-shell').getAttribute('data-theme'), 'dark');
  await verifyWidths(page, 'organizer-dashboard');
  await page.setViewportSize({ width: 1440, height: 900 });
  const selection = page.getByRole('combobox', { name: 'Active organization' });
  await selectWorkspaceOption(selection, { label: 'Beta Events' });
  await metric(page, 'Next seven days', 0);
  allowLate();
  await lateSettled;
  await page.getByRole('heading', { name: 'Beta Events', exact: true }).waitFor();
  await page.getByText('No concerts in preparation.', { exact: true }).waitFor();
  assert.equal(await page.getByText(performance.title, { exact: true }).count(), 0);

  const reads = scopedReads;
  await selectWorkspaceOption(selection, { label: 'Finance only' });
  await page.getByRole('link', { name: 'View financial reports', exact: true }).waitFor();
  assert.equal(await page.getByRole('link', { name: 'Create concert', exact: true }).count(), 0);
  assert.equal(await page.getByRole('region', { name: 'On sale now', exact: true }).count(), 0);
  assert.equal(scopedReads, reads);
  await context.close();
}

try {
  if (output) await mkdir(output, { recursive: true });
  await adminDashboard();
  await organizerDashboard();
  console.log('Dashboard totals, drill-down, partial recovery, responsive widths and organizer scope passed.');
} finally {
  await browser.close();
}
