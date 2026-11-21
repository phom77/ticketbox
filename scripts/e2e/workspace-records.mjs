import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18105';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname));
const output = process.env.WORKSPACE_RECORDS_UI_OUTPUT ?? '.artifacts/e2e/workspace-records';
await mkdir(output, { recursive: true });

const organizer = {
  id: '10000000-0000-0000-0000-000000000001',
  fullName: 'Workspace Organizer',
  email: 'workspace-organizer@example.com',
  role: 'ORGANIZER',
};
const organization = { id: '20000000-0000-0000-0000-000000000002', name: 'Lantern House', grants: ['MEMBERS', 'FINANCE'] };
const colleagueId = '30000000-0000-0000-0000-000000000003';
const concert = { id: '40000000-0000-0000-0000-000000000004', title: 'Saigon Philharmonic' };
const data = [organizer, { accountId: colleagueId, grants: ['EVENTS'], active: true }];
data[0] = { accountId: organizer.id, grants: organization.grants, active: true };
const tokenPayload = Buffer.from(JSON.stringify({ ...organizer, sub: organizer.id, exp: Math.floor(Date.now() / 1000) + 86400 })).toString('base64url');
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 1920, height: 1080 }, acceptDownloads: true });
await context.addCookies([{ name: 'ticketbox_auth_token', value: 'header.' + tokenPayload + '.signature', url: baseURL }]);
const page = await context.newPage();
page.setDefaultTimeout(6000);

let seenSearch = false;
let appliedConcert = '';
let exportedConcert = '';
let invites = 0;
let memberUpdates = 0;
await page.route('**/api/**', async (route) => {
  const request = route.request();
  const url = new URL(request.url());
  const respond = (data) => route.fulfill({ json: { code: 0, message: 'ok', data } });
  if (url.pathname === '/api/auth/me') return respond(organizer);
  if (url.pathname === '/api/organizations') return respond([organization]);
  if (url.pathname === '/api/organizations/' + organization.id + '/members') return respond(data);
  if (url.pathname === '/api/organizations/' + organization.id + '/members/' + colleagueId) {
    assert.equal(request.method(), 'PUT');
    data[1] = { ...data[1], grants: request.postDataJSON().grants };
    memberUpdates++;
    return respond(null);
  }
  if (url.pathname === '/api/organizations/' + organization.id + '/invitations') {
    assert.equal(request.method(), 'POST');
    invites++;
    return respond({ code: 'fixture-invitation', expiresAt: '2028-11-22T00:00:00Z' });
  }
  if (url.pathname === '/api/organizer/manage/concerts') {
    const match = url.searchParams.get('query') === 'philharmonic';
    seenSearch ||= match;
    return respond({ content: match ? [concert] : [] });
  }
  if (url.pathname === '/api/organizer/reconciliation') {
    appliedConcert = url.searchParams.get('concertId') ?? '';
    return respond({
      content: [{ intentId: 'intent-1', orderId: 'order-1', organizationId: organization.id,
        concertTitle: concert.title, provider: 'VNPAY', paymentState: 'SUCCEEDED', orderStatus: 'PAID',
        requestedAmount: 250000, transactionId: 'gateway-reference-1', collectedAmount: 250000,
        attemptedAt: '2026-11-21T12:00:00Z', verifiedAt: '2026-11-21T12:01:00Z',
        refundAmount: null, refundReference: null, receivedAt: '2026-11-21T12:02:00Z' }],
      totals: { transactions: 1, paidOrderSales: 250000, verifiedCollections: 250000,
        missingSnapshots: 0, latestSnapshot: '2026-11-21T12:02:00Z' }, page: 0, size: 20,
    });
  }
  if (url.pathname === '/api/organizer/reconciliation/export') {
    exportedConcert = url.searchParams.get('concertId') ?? '';
    return route.fulfill({ contentType: 'text/csv', body: 'orderId\norder-1\n' });
  }
  return respond(null);
});

async function capture(screen, width) {
  await page.setViewportSize({ width, height: 1000 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${screen} at ${width}px`);
  await page.screenshot({ path: `${output}/${screen}-${width}.png`, animations: 'disabled' });
}

try {
  await page.goto('/organizer/members');
  await page.getByRole('heading', { name: 'Members', exact: true }).first().waitFor();
  assert.equal(await page.getByLabel('Recipient account ID').isVisible(), false);
  assert.equal(await page.getByRole('checkbox').count(), 0);
  await page.getByRole('searchbox', { name: 'Search members' }).fill('000000000003');
  await page.getByRole('button', { name: 'Edit permissions for ' + colleagueId }).click();
  const panel = page.getByRole('region', { name: 'Edit permissions' });
  await panel.getByRole('checkbox', { name: 'View orders and revenue' }).check();
  await capture('member-permissions', 1920);
  await panel.getByRole('button', { name: 'Save permissions' }).click();
  await page.getByRole('status').filter({ hasText: 'Permissions updated' }).waitFor();
  assert.equal(memberUpdates, 1);
  await page.getByRole('button', { name: 'Invite member', exact: true }).click();
  await page.getByLabel('Recipient account ID').fill('50000000-0000-0000-0000-000000000005');
  await page.getByRole('region', { name: 'Invite member' }).getByRole('checkbox', { name: 'View orders and revenue' }).check();
  await page.getByRole('button', { name: 'Create invitation', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'fixture-invitation' }).waitFor();
  assert.equal(invites, 1);
  await capture('member-invite', 834);
  await capture('member-invite', 390);

  await page.goto('/organizer/reconciliation');
  await page.getByRole('heading', { name: 'Payment reconciliation', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Concert', exact: true }).click();
  const search = page.getByRole('searchbox', { name: 'Search concerts' });
  await search.fill('philharmonic');
  await page.getByRole('button', { name: concert.title, exact: true }).click();
  assert.ok(seenSearch);
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await page.getByRole('cell', { name: /gateway-reference-1/ }).waitFor();
  assert.equal(appliedConcert, concert.id);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download CSV', exact: true }).click();
  await download;
  assert.equal(exportedConcert, concert.id);
  await capture('reconciliation', 1920);
  await capture('reconciliation', 834);
  await capture('reconciliation', 390);
  console.log('Workspace records passed member permissions, invitations, concert search, report filters and CSV export.');
} finally {
  await browser.close();
}
