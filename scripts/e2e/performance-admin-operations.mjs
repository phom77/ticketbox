import { approvePerformanceReview } from './performance-review-fixture.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18105';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use an isolated loopback deployment');
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, locale: 'en-US', timezoneId: 'America/Los_Angeles',
  reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(30_000);
const directory = '/api/admin/v2/performances';
const manage = '/api/organizer/manage/v2';
const suffix = randomUUID().slice(0, 8);
const venueName = 'Operations theater ' + suffix;
const title = 'Evening recital ' + suffix;
const reportDirectory = process.env.E2E_REPORT_DIRECTORY;
const baseTime = Math.floor(Date.now() / 60_000) * 60_000;
const at = hours => new Date(baseTime + hours * 3_600_000).toISOString();
const local = hours => at(hours + 7).slice(0, 16);
const token = session => ({ Authorization: 'Bearer ' + session.accessToken });

async function api(method, path, headers, data, status = 200) {
  const response = await context.request.fetch(path, { method, headers, data });
  assert.equal(response.status(), status, method + ' ' + path + ' ' + await response.text());
  return (await response.json()).data;
}

function login(role) {
  return api('POST', '/api/auth/login', undefined, { email: role + '@ticketbox.com', password: 'password123' });
}

async function capture(stage) {
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
      `${stage} overflows at ${width}px`);
    await page.evaluate(() => window.scrollTo(0, 0));
    if (reportDirectory) await page.screenshot({
      path: `${reportDirectory}/admin-performance-${stage}-${width}.png`, fullPage: true, animations: 'disabled',
    });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

try {
  if (reportDirectory) await mkdir(reportDirectory, { recursive: true });
  const admin = await login('admin');
  const organizer = await login('organizer');
  const adminHeaders = token(admin);
  const organization = await api('POST', '/api/admin/organizations', adminHeaders,
    { name: 'Operations rehearsal ' + suffix, initialManagerId: organizer.user.id }, 201);
  const organizerHeaders = { ...token(organizer), 'X-Organization-Id': organization.id };
  const venue = await api('POST', manage + '/venues', organizerHeaders,
    { name: venueName, address: 'South Avenue', spaceName: 'Concert hall' });
  const event = await api('POST', manage + '/events', organizerHeaders,
    { title, segment: 'concerts', primaryGenre: 'vpop' });
  const schedule = {
    venueSpaceId: venue.spaces[0].id, startsAt: at(72), endsAt: at(75), doorsOpenAt: at(71),
    timezone: 'Asia/Ho_Chi_Minh', saleStartAt: at(1), saleEndAt: at(24), maxPerAccount: 4, publicVisible: false,
  };
  const show = await api('POST', manage + '/events/' + event.id + '/performances', organizerHeaders, schedule);
  const draft = await api('POST', manage + '/events/' + event.id + '/performances', organizerHeaders,
    { ...schedule, startsAt: at(96), endsAt: at(99) });
  const groupId = randomUUID();
  const sale = await api('PUT', manage + '/performances/' + show.id + '/sale', organizerHeaders, {
    expectedSaleVersion: 0,
    groups: [{ id: groupId, sectionId: null, sectionLabel: 'GA', kind: 'GA', capacity: 60, seats: [] }],
    offers: [{ id: randomUUID(), groupId, name: 'General admission', price: 150000, currency: 'VND',
      saleStartAt: schedule.saleStartAt, saleEndAt: schedule.saleEndAt, active: true }],
  });
  const publishAt = at(0.5);
  const review = await api('POST', manage + '/performances/' + show.id + '/publication', organizerHeaders,
    { expectedSaleVersion: sale.version, expectedLayoutVersion: 0,
      expectedEventDraftVersion: event.draftVersion, expectedScheduleDraftVersion: show.draftVersion, publishAt });
  await approvePerformanceReview(context.request, admin.accessToken, review);
  let published = false;
  for (let attempt = 0; attempt < 40 && !published; attempt += 1) {
    published = (await context.request.get(directory + '/' + show.id, { headers: adminHeaders })).ok();
    if (!published) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(published, 'The scheduled show entered operations');

  const unauthenticated = await context.request.get(directory);
  assert.equal(unauthenticated.status(), 401);
  await api('GET', directory, token(organizer), undefined, 403);
  await api('GET', directory + '/' + draft.id, adminHeaders, undefined, 404);
  const found = await api('GET', directory + '?' + new URLSearchParams({ query: venueName }), adminHeaders);
  assert.deepEqual(found.content.map(row => row.id), [show.id]);

  await context.addCookies([{ name: 'ticketbox_auth_token', value: admin.accessToken, url: baseURL }]);
  await page.goto('/admin/performance-operations');
  await page.getByRole('searchbox', { name: 'Find a performance' }).fill(venueName);
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  const record = page.getByRole('link', { name: new RegExp(title) });
  await record.waitFor();
  await capture('search');
  await record.click();
  assert.equal(new URL(page.url()).searchParams.get('performance'), show.id);
  await page.getByRole('heading', { name: 'Orders affected' }).waitFor();
  await page.getByText('There are no affected orders.').waitFor();
  await capture('detail');

  await page.getByRole('button', { name: 'Cancel performance', exact: true }).click();
  await page.getByRole('textbox', { name: 'Reason' }).fill('Synthetic test fixture');
  await page.getByRole('button', { name: 'Review change', exact: true }).click();
  const cancelDialog = page.getByRole('dialog', { name: 'Cancel performance' });
  await cancelDialog.waitFor();
  assert.equal(await cancelDialog.getByRole('button', { name: 'Go back' }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press('Escape');
  await cancelDialog.waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Discard changes', exact: true }).click();
  await page.getByRole('button', { name: 'Postpone performance', exact: true }).click();
  const starts = page.locator('input[name="startsAt"]');
  assert.equal(await starts.getAttribute('type'), 'datetime-local');
  assert.equal(await starts.inputValue(), local(72));
  await starts.fill(local(96));
  await page.getByRole('textbox', { name: 'Reason' }).fill('Sound check moved');
  await page.getByRole('button', { name: 'Review change', exact: true }).click();
  await page.getByText('End time must be after the start time.').waitFor();
  await page.locator('input[name="endsAt"]').fill(local(99));
  await page.locator('input[name="doorsOpenAt"]').fill(local(95));
  await capture('reschedule');
  await page.getByRole('button', { name: 'Review change', exact: true }).click();
  const postpone = page.getByRole('dialog', { name: 'Postpone performance' });
  await postpone.getByText(/New show time/).waitFor();
  await postpone.getByRole('button', { name: 'Postpone performance', exact: true }).click();
  await postpone.waitFor({ state: 'hidden' });
  const resume = page.getByRole('button', { name: 'Resume sale', exact: true });
  await resume.waitFor({ timeout: 30_000 });
  const changed = await api('GET', directory + '/' + show.id, adminHeaders);
  assert.equal(Date.parse(changed.startsAt), Date.parse(at(96)));
  assert.equal(changed.salesSuspended, true);
  await page.getByRole('link', { name: 'All performances' }).click();
  await page.getByRole('searchbox', { name: 'Find a performance' }).waitFor();
  assert.equal(await page.getByRole('searchbox', { name: 'Find a performance' }).inputValue(), venueName);
  console.log('Platform admin search, authorization, schedule review and postponement passed.');
} finally {
  await browser.close();
}
