import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { chromium, request } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:5186';
const liveOnly = process.argv.includes('--live');
const browser = liveOnly ? null : await chromium.launch();
const organizationId = '71f141c0-cc20-45d8-a49e-9959f6d14b10';
const financeOrg = '70561607-548b-4870-b272-7ffa19d139a1';
const eventsOrg = '4c19e46e-e576-4c56-8df0-6d5c723708f8';
const eventId = 'ccab2046-b826-40de-9862-420869dc1282';
const performanceId = 'b856caea-76cb-4254-adad-c670ffd18688';
const concertId = 'a3588cf6-3d6a-4a35-8909-b4493429e86a';
const range = { from: '2026-12-15T00:00:00+07:00', to: '2026-12-31T00:00:00+07:00' };
const show = {
  id: performanceId, eventId, title: 'Winter Strings', organizationId, legacyConcertId: null,
  venueName: 'East Theater', spaceName: 'Main Hall', startsAt: '2026-12-20T12:00:00Z',
  endsAt: '2026-12-20T15:00:00Z', timezone: 'Asia/Ho_Chi_Minh', status: 'ON_SALE',
  publicVisible: true, salesSuspended: false, saleStartAt: '2026-11-20T12:00:00Z',
  saleEndAt: '2026-12-20T10:00:00Z', publicationStatus: 'PUBLISHED',
  ticketingAcknowledged: false, checkinAcknowledged: null,
};
const reconciliation = {
  content: [{
    intentId: 'payment', orderId: 'order', organizationId, concertTitle: 'Winter Strings', provider: 'VNPAY',
    paymentState: 'SUCCEEDED', orderStatus: 'PAID', requestedAmount: 300000, transactionId: 'confirmed',
    collectedAmount: 300000, attemptedAt: '2026-12-18T08:00:00Z', verifiedAt: '2026-12-18T09:00:00Z',
    refundAmount: 100000, refundReference: 'fixture-refund', receivedAt: '2026-12-18T09:01:00Z',
  }],
  totals: { transactions: 1, paidOrderSales: 200000, verifiedCollections: 300000, missingSnapshots: 0,
    latestSnapshot: '2026-12-18T09:01:00Z' },
  page: 0, size: 20,
};
const completedConcert = { id: concertId, title: 'Winter Strings', eventDate: show.startsAt, status: 'COMPLETED' };

async function fixture(role, run) {
  const context = await browser.newContext({ baseURL, locale: 'en-US', timezoneId: 'America/Los_Angeles',
    colorScheme: 'light', viewport: { width: 1440, height: 900 } });
  const user = { id: 'report-test', email: 'reports@example.test', fullName: 'Report fixture', role };
  const payload = Buffer.from(JSON.stringify({ ...user, sub: user.id, exp: Math.floor(Date.now() / 1000) + 3600 }));
  await context.addCookies([{ name: 'ticketbox_auth_token', value: `e30.${payload.toString('base64url')}.fixture`, url: baseURL }]);
  const page = await context.newPage();
  page.setDefaultTimeout(4500);
  const requests = { operational: [], finance: [], export: [] };
  let operationalFailure = false;
  const setOperationalFailure = (value) => { operationalFailure = value; };
  page.on('pageerror', (error) => console.error(error.message));
  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const { pathname, searchParams } = new URL(route.request().url());
    const reply = (data, status = 200) => route.fulfill({ status, json: { data, code: status, message: 'Fixture response' } });
    const organization = route.request().headers()['x-organization-id'];
    if (pathname === '/api/auth/me') return reply(user);
    if (pathname === '/api/organizations') return reply([
      { id: organizationId, name: 'East Productions', grants: ['EVENTS', 'FINANCE'] },
      { id: financeOrg, name: 'Finance office', grants: ['FINANCE'] },
      { id: eventsOrg, name: 'Event office', grants: ['EVENTS'] },
    ]);
    if (pathname === '/api/admin/organizations') return reply([{ id: organizationId, name: 'East Productions', initialManagerId: user.id }]);
    if (pathname.endsWith('/operations-report')) {
      requests.operational.push({ query: searchParams, organization });
      if (operationalFailure) return reply(null, 503);
      const number = Number(searchParams.get('page') ?? 0);
      const none = searchParams.get('status') === 'CANCELLED';
      const selected = searchParams.get('performanceId');
      const firstPage = [show, ...Array.from({ length: 19 }, (_, index) => ({ ...show, id: randomUUID(), title: 'Festival show ' + (index + 1) }))];
      const lastPage = [{ ...show, id: randomUUID(), title: 'Second Night' }];
      return reply({ content: none ? [] : selected ? [show] : number ? lastPage : firstPage,
        totalElements: none ? 0 : selected ? 1 : 21, totalPages: none ? 0 : selected ? 1 : 2, number, size: 20 });
    }
    if (pathname.endsWith('/reconciliation')) {
      requests.finance.push({ query: searchParams, organization });
      return reply(organization === financeOrg
        ? { ...reconciliation, content: [], totals: { ...reconciliation.totals, transactions: 0, paidOrderSales: 0,
          verifiedCollections: 0, latestSnapshot: null } }
        : reconciliation);
    }
    if (pathname.endsWith('/reconciliation/export')) {
      requests.export.push(searchParams);
      return route.fulfill({ status: 200, contentType: 'text/csv', body: 'order_id,refund_reference\norder,fixture-refund\n' });
    }
    if (pathname === '/api/organizer/concerts' || pathname.endsWith('/concerts')) {
      return reply({ content: [completedConcert], totalElements: 1, totalPages: 1, number: 0, size: 100 });
    }
    if (pathname.endsWith('/revenue-summary')) {
      return reply({ concertId, totalRevenue: 200000, totalTicketsSold: 2, totalTicketsAvailable: 10, soldRate: 20 });
    }
    if (pathname.endsWith('/zone-revenue') || pathname.endsWith('/sales-trend')) return reply([]);
    if (pathname.endsWith('/revenue-report/export')) {
      requests.export.push(searchParams);
      return route.fulfill({ status: 200, contentType: 'text/csv', body: 'concert,revenue\nWinter Strings,200000\n' });
    }
    return reply(null, 404);
  });
  try {
    await run(page, requests, setOperationalFailure);
  } catch (error) {
    console.error(`Report fixture failed at ${page.url()}`, await page.locator('h1').allTextContents());
    throw error;
  } finally {
    await context.close();
  }
}

const url = (page) => new URL(page.url());
const heading = (page) => page.getByRole('heading', { name: 'Reports', exact: true });
const apply = (page) => page.getByRole('button', { name: 'Apply filters', exact: true });

try {
  if (liveOnly) {
    await verifyLiveExportGrants(process.env.TICKETBOX_E2E_LIVE_URL ?? 'http://localhost:18125');
    process.exit(0);
  }
  await fixture('ADMIN', async (page, requests, failReport) => {
    const returnTo = `/admin/events/${eventId}?show=${performanceId}&tab=operations`;
    const params = new URLSearchParams({ ...range, eventId, performanceId, returnTo });
    await page.goto(`/admin/reports?${params}`);
    await heading(page).waitFor();

    const list = page.getByRole('table', { name: 'Performances in this period' });
    await list.getByText('Winter Strings', { exact: true }).waitFor();
    await list.getByText('Awaiting sync').waitFor();
    await list.getByText('No data').waitFor();
    assert.equal((await page.getByRole('link', { name: 'Back to concert' }).getAttribute('href')), returnTo);
    const detail = await list.getByRole('link', { name: /open performance/i }).getAttribute('href');
    assert.equal(new URL(detail, baseURL).pathname, `/admin/events/${eventId}`);
    assert.equal(new URL(detail, baseURL).searchParams.get('show'), performanceId);
    assert.equal(requests.operational.at(-1).query.get('performanceId'), performanceId);
    assert.equal(requests.operational.at(-1).query.get('from'), range.from);
    assert.equal(await page.getByLabel('From').inputValue(), '2026-12-15T00:00');
    await page.getByText('1 performance', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Clear performance' }).press('Enter');
    await apply(page).press('Enter');
    await page.getByText('21 performances', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Switch to dark mode' }).press('Enter');
    assert.equal(await page.locator('.operations-shell').getAttribute('data-theme'), 'dark');
    for (const width of [834, 390, 320, 1440]) {
      await page.setViewportSize({ width, height: 900 });
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Report overflows at ${width}px`);
    }
    await page.getByRole('combobox', { name: 'Language' }).press('Enter');
    await page.getByRole('option', { name: 'Tiếng Việt' }).click();
    await page.getByRole('heading', { name: 'Báo cáo vận hành', exact: true }).waitFor();
    await page.getByRole('combobox', { name: 'Ngôn ngữ' }).press('Enter');
    await page.getByRole('option', { name: 'English' }).click();
    await page.getByRole('link', { name: 'Next page' }).press('Enter');
    await list.getByText('Second Night', { exact: true }).waitFor();
    await page.getByText('21 performances', { exact: true }).waitFor();
    assert.equal(url(page).searchParams.get('page'), '1');
    await page.reload();
    await list.getByText('Second Night', { exact: true }).waitFor();
    assert.equal(requests.operational.at(-1).query.get('page'), '1');

    const previousRequests = requests.operational.length;
    await page.getByLabel('From').fill('2027-01-01T00:00');
    await apply(page).click();
    const invalid = page.getByRole('alert').filter({ hasText: 'The end must be after the start.' });
    await invalid.waitFor();
    assert.equal(await page.getByLabel('From').getAttribute('aria-invalid'), 'true');
    assert.equal(requests.operational.length, previousRequests);
    await page.getByLabel('From').fill('2026-12-15T00:00');
    await page.getByLabel('Before').fill('2028-12-31T00:00');
    await apply(page).click();
    await page.getByRole('alert').filter({ hasText: 'Choose a period of 366 days or less.' }).waitFor();
    assert.equal(requests.operational.length, previousRequests);
    await page.getByLabel('Before').fill('2026-12-31T00:00');
    await page.getByRole('combobox', { name: 'Performance status' }).press('Enter');
    await page.getByRole('option', { name: 'Canceled' }).click();
    await apply(page).click();
    await page.getByText('No performances match these filters.').waitFor();
    assert.equal(url(page).searchParams.get('page'), null);
    assert.equal(requests.operational.at(-1).query.get('status'), 'CANCELLED');
    await page.goBack();
    await list.getByText('Second Night').waitFor();

    failReport(true);
    await page.reload();
    await page.getByRole('alert').filter({ hasText: 'Could not load the operational report.' }).waitFor();
    failReport(false);
    await page.getByRole('button', { name: 'Try again' }).click();
    await list.getByText('Second Night').waitFor();
  });

  await fixture('ADMIN', async (page, requests) => {
    await page.goto('/admin/reconciliation');
    await page.getByRole('heading', { name: 'Payment reconciliation' }).waitFor();
    await page.goto(`/admin/reports?view=reconciliation&from=2026-12-15&to=2026-12-31&basis=COLLECTION&concertId=${concertId}`);
    await heading(page).waitFor();
    await page.getByText('Paid order sales', { exact: true }).waitFor();
    await page.getByText('Verified collections', { exact: true }).waitFor();
    await page.getByRole('cell').filter({ hasText: 'fixture-refund' }).waitFor();
    await page.getByRole('combobox', { name: 'Organization' }).press('Enter');
    await page.getByRole('option', { name: 'Unattributed' }).click();
    await apply(page).click();
    await page.waitForURL((current) => current.searchParams.get('unattributed') === 'true');
    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: 'Download CSV' }).click(),
    ]);
    assert.match(await readFile(await download.path(), 'utf8'), /order,fixture-refund/);
    const active = requests.finance.at(-1).query;
    active.delete('page');
    assert.deepEqual(Object.fromEntries(requests.export.at(-1)), Object.fromEntries(active));
    assert.equal(active.get('basis'), 'COLLECTION');
  });

  await fixture('ORGANIZER', async (page, requests) => {
    await page.goto(`/organizer/reports?view=reconciliation&concertId=${concertId}`);
    await page.getByRole('cell').filter({ hasText: 'fixture-refund' }).waitFor();
    assert.equal(requests.finance.at(-1).query.get('concertId'), concertId);
    assert.equal(requests.finance.at(-1).organization, organizationId);
    await page.getByRole('combobox', { name: 'Active organization' }).press('Enter');
    await page.getByRole('option', { name: 'Finance office' }).click();
    await page.getByText('No transactions match these filters.').waitFor();
    assert.equal(requests.finance.at(-1).organization, financeOrg);
    assert.equal(requests.finance.at(-1).query.get('concertId'), null);
    assert.equal(url(page).searchParams.get('concertId'), null);
    assert.equal(await page.getByRole('link', { name: 'Operations', exact: true }).count(), 0);
    assert.equal(await page.getByRole('combobox', { name: 'Organization', exact: true }).count(), 0);

    await page.goto(`/organizer/reports?view=operations&performanceId=${performanceId}`);
    await page.getByText('Your organization hasn’t granted concert management access.').waitFor();
    assert.equal(requests.operational.length, 0);

    await page.getByRole('link', { name: 'Revenue', exact: true }).click();
    await page.getByText('The date filter applies to the daily trend. Totals, ticket types and CSV or PDF exports cover the entire concert.').waitFor();
    await page.waitForURL((current) => current.searchParams.get('concertId') === concertId);
    assert.equal(url(page).searchParams.get('view'), 'revenue');
    for (const [format, label] of [['csv', 'Export CSV'], ['pdf', 'Export PDF']]) {
      const [download] = await Promise.all([
        page.waitForEvent('download'),
        page.getByRole('button', { name: label }).click(),
      ]);
      assert(download.suggestedFilename().endsWith('.' + format));
      assert.deepEqual(Object.fromEntries(requests.export.at(-1)), { format });
    }
    await page.getByRole('link', { name: 'Organization orders' }).waitFor();
    await page.getByRole('combobox', { name: 'Active organization' }).press('Enter');
    await page.getByRole('option', { name: 'Event office' }).click();
    await page.getByText('Your organization hasn’t granted access to financial reports.').waitFor();
    assert.equal(await page.getByRole('link', { name: 'Organization orders' }).count(), 0);
    assert.equal(url(page).searchParams.get('concertId'), null);
  });
  console.log('Operational filters, paging and history, report recovery, finance exports and organization access passed.');
  if (process.env.TICKETBOX_E2E_LIVE_URL) await verifyLiveExportGrants(process.env.TICKETBOX_E2E_LIVE_URL);
} finally {
  await browser?.close();
}

async function verifyLiveExportGrants(baseURL) {
  assert(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use an isolated loopback deployment');
  const api = await request.newContext({ baseURL });
  const auth = (session) => ({ Authorization: 'Bearer ' + session.accessToken });
  async function login(role) {
    const response = await api.post('/api/auth/login', {
      data: { email: role + '@ticketbox.com', password: 'password123' },
    });
    assert.equal(response.status(), 200);
    return (await response.json()).data;
  }
  try {
    const [admin, organizer] = await Promise.all([login('admin'), login('organizer')]);
    const created = await api.post('/api/admin/organizations', {
      headers: auth(admin), data: { name: 'Report export permissions ' + randomUUID(), initialManagerId: organizer.user.id },
    });
    assert.equal(created.status(), 201);
    const { id } = (await created.json()).data;
    const headers = { ...auth(organizer), 'X-Organization-Id': id };
    const filters = '?from=2026-12-15&to=2026-12-31&basis=COLLECTION';
    const exportPath = '/api/organizer/reconciliation/export' + filters;
    const allowed = await api.get(exportPath, { headers });
    assert.equal(allowed.status(), 200);
    assert.match(await allowed.text(), /^order_id,intent_id,organization_id,concert_id,/);
    const adminPath = '/api/admin/reconciliation/export' + filters;
    assert.equal((await api.get(adminPath, { headers: auth(admin) })).status(), 200);
    assert.equal((await api.get(adminPath, { headers })).status(), 403);
    const revoked = await api.put(`/api/organizations/${id}/members/${organizer.user.id}`, {
      headers, data: { grants: ['EVENTS', 'MEMBERS'] },
    });
    assert.equal(revoked.status(), 200);
    for (const path of [
      '/api/organizer/reconciliation' + filters,
      exportPath,
      `/api/organizer/concerts/${concertId}/revenue-report/export?format=csv`,
      `/api/organizer/concerts/${concertId}/revenue-report/export?format=pdf`,
    ]) {
      assert.equal((await api.get(path, { headers })).status(), 403, path);
    }
    console.log('Live Ticketing report and export permissions passed.');
  } finally {
    await api.dispose();
  }
}
