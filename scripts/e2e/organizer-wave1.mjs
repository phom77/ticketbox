// Wave 1 walkthrough: native event content, reviewed revisions, drafts, legacy read-only, guests and sales reporting.
// Needs an isolated Compose project (see docs/development.md). Reads TICKETBOX_E2E_URL (default http://localhost:18110)
// and E2E_PROJECT. Writes screenshots and a JSON summary to E2E_REPORT_DIRECTORY (default .artifacts/e2e/wave1).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { selectWorkspaceOption } from './select-workspace-option.mjs';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18110';
const project = process.env.E2E_PROJECT ?? 'ticketbox-e2e-wave1';
assert.match(project, /^ticketbox-e2e(?:-[a-z0-9-]+)?$/);
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use an isolated loopback deployment');
const report = process.env.E2E_REPORT_DIRECTORY ?? '.artifacts/e2e/wave1';
const shots = report + '/screenshots';
await mkdir(shots, { recursive: true });

const suffix = randomUUID().slice(0, 8);
const results = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

async function until(check, { seconds = 90, label = 'condition' } = {}) {
  const deadline = Date.now() + seconds * 1000;
  let failure;
  while (Date.now() < deadline) {
    try {
      const value = await check();
      if (value) return value;
    } catch (error) { failure = error; }
    await sleep(1000);
  }
  throw new Error('Timed out waiting for ' + label + (failure ? ': ' + failure.message : ''));
}

async function api(method, path, { token, body, headers = {}, expect = [200] } = {}) {
  const response = await fetch(baseURL + path, {
    method,
    headers: { ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      ...(token ? { Authorization: 'Bearer ' + token } : {}), ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  assert.ok(expect.includes(response.status), method + ' ' + path + ' -> ' + response.status + ' ' + text.slice(0, 400));
  let payload = {};
  try { payload = text ? JSON.parse(text) : {}; } catch { payload = { raw: text }; }
  return { status: response.status, data: payload.data ?? payload, payload, headers: response.headers, text };
}

function sql(service, query) {
  const database = { notification: 'ticketbox_notifications', payment: 'ticketbox_payments' }[service] ?? 'ticketbox_' + service;
  return execFileSync('docker', ['compose', '-p', project, '-f', 'compose.yaml', 'exec', '-T', service + '-db', 'psql', '-U', service + '_owner',
    '-d', database, '-At', '-v', 'ON_ERROR_STOP=1', '-c', query], { encoding: 'utf8' }).trim();
}

async function login(email, password = 'password123') {
  const { data } = await api('POST', '/api/auth/login', { body: { email, password } });
  return data;
}

async function register(label) {
  const email = label + '-' + suffix + '@example.test';
  const password = 'fixture-wave1-pass';
  const { data } = await api('POST', '/api/auth/register', { body: { email, fullName: label + ' fixture', password }, expect: [201] });
  return { id: data.id, email, password };
}

const browser = await chromium.launch();

async function session(auth, organization) {
  const context = await browser.newContext({ baseURL, locale: 'en-US', reducedMotion: 'reduce', colorScheme: 'light', viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  await context.addCookies([{ name: 'ticketbox_auth_token', value: auth.accessToken, url: baseURL }]);
  if (organization) {
    await context.addInitScript(({ user, organization }) => {
      sessionStorage.setItem('ticketbox.organization.' + user, organization);
      localStorage.setItem('ticketbox.theme', 'light');
    }, { user: auth.user.id, organization });
  }
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return { context, page };
}

/** Screenshots at the three required widths; fails on horizontal overflow. */
async function shoot(page, name) {
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    const offenders = overflow > 1 ? await page.evaluate(() => [...document.querySelectorAll('body *')].filter((node) => node.getBoundingClientRect().right > window.innerWidth + 1 && ![...node.children].some((child) => child.getBoundingClientRect().right > window.innerWidth + 1))
      .slice(0, 6).map((node) => node.tagName.toLowerCase() + '.' + String(node.className).slice(0, 60) + ' right=' + Math.round(node.getBoundingClientRect().right))) : [];
    await page.screenshot({ path: shots + '/' + name + '-' + width + '.png', fullPage: true, animations: 'disabled' });
    assert.ok(overflow <= 1, name + ' overflows horizontally by ' + overflow + 'px at ' + width + 'px: ' + offenders.join('; '));
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    await page.screenshot({ path: shots + '/' + name + '-' + width + '.png', fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function flow(id, name, run) {
  const started = Date.now();
  try {
    const evidence = await run();
    results.push({ id, name, status: 'pass', evidence, seconds: Math.round((Date.now() - started) / 1000) });
    console.log('PASS', id, name, JSON.stringify(evidence ?? ''));
  } catch (error) {
    results.push({ id, name, status: 'fail', error: String(error.stack ?? error).split('\n').slice(0, 6).join('\n') });
    console.log('FAIL', id, name, '\n', error.message);
  }
}

const state = {};
try {
  // ---------- Setup: accounts and one organization with FINANCE-only and EVENTS-only members ----------
  const admin = await login('admin@ticketbox.com');
  const manager = await login('organizer@ticketbox.com');
  const buyer = await login('audience@ticketbox.com');
  const organization = (await api('POST', '/api/admin/organizations', { token: admin.accessToken, expect: [201],
    body: { name: 'Wave one ' + suffix, initialManagerId: manager.user.id } })).data.id;
  const scope = { 'X-Organization-Id': organization };
  const second = await register('second-admin');
  sql('identity', "UPDATE users SET role='ADMIN' WHERE id='" + second.id + "'");
  const secondAdmin = await login(second.email, second.password);
  const members = {};
  for (const grant of ['FINANCE', 'EVENTS']) {
    const account = await register(grant.toLowerCase() + '-member');
    sql('identity', "UPDATE users SET role='ORGANIZER' WHERE id='" + account.id + "'");
    const auth = await login(account.email, account.password);
    const invite = (await api('POST', '/api/organizations/' + organization + '/invitations', { token: manager.accessToken, expect: [201],
      body: { accountId: account.id, grants: [grant] } })).data;
    await api('POST', '/api/organizations/invitations/accept', { token: auth.accessToken, body: { code: invite.code } });
    members[grant] = auth;
  }
  const prefix = '/api/organizer/manage/v2';
  const organizer = (path, options = {}) => api(options.method ?? 'GET', prefix + path, { token: manager.accessToken, headers: scope, ...options });
  const mgr = await session(manager, organization);
  const adm = await session(admin);

  // ---------- Flow 1: native event with details, poster attempt, performances, release ----------
  const title = 'Wave one concert ' + suffix;
  const copy = {
    description: 'Original description ' + suffix,
    en: { title: 'Wave one concert EN ' + suffix, description: 'Original English description ' + suffix },
    vi: { title: 'Đêm nhạc Wave ' + suffix, description: 'Mô tả gốc ' + suffix },
  };
  await flow(1, 'Organizer creates a native event and releases a performance', async () => {
    const page = mgr.page;
    await page.goto('/organizer/events/new');
    await page.locator('input[name="title"]').fill(title);
    await page.locator('textarea[name="description"]').fill(copy.description);
    const vi = page.getByRole('group', { name: 'Tiếng Việt' });
    await vi.getByLabel('Event title').fill(copy.vi.title);
    await vi.getByLabel('Description').fill(copy.vi.description);
    const en = page.getByRole('group', { name: 'English' });
    await en.getByLabel('Event title').fill(copy.en.title);
    await en.getByLabel('Description').fill(copy.en.description);
    await selectWorkspaceOption(page.getByLabel('Age rating'), { label: '16+' });
    await page.locator('textarea[name="refundPolicy"]').fill('Full refund up to 7 days before the show.');
    await page.locator('textarea[name="artistBio"]').fill('Nguyen Anh is a singer and songwriter from Hanoi.');
    await page.locator('input[type="file"]').setInputFiles({ name: 'poster.png', mimeType: 'image/png', buffer: png });
    await shoot(page, 'event-details-step');
    const created = page.waitForResponse((response) => response.url().endsWith(prefix + '/events') && response.request().method() === 'POST');
    const posterAttempt = page.waitForResponse((response) => /\/events\/[^/]+\/poster/.test(response.url()), { timeout: 15_000 }).catch(() => null);
    await page.getByRole('button', { name: 'Save and continue' }).click();
    const eventResponse = await created;
    assert.equal(eventResponse.status(), 200, await eventResponse.text());
    state.event = (await eventResponse.json()).data;
    const poster = await posterAttempt;
    const posterStatus = poster ? poster.status() : 'not attempted';
    const posterBody = poster ? (await poster.text()).slice(0, 200) : '';
    await page.waitForTimeout(1500);
    state.posterUi = (await page.locator('[role="alert"], [role="status"], [data-sonner-toast], .toast').allInnerTexts()).join(' | ');
    state.poster = { status: posterStatus, body: posterBody, ui: state.posterUi };
    // A poster above nginx's default 1 MB limit must reach Catalog (503 here because Cloudinary is not configured), not fail with 413.
    const large = new FormData();
    large.append('file', new Blob([png, Buffer.alloc(2_000_000)], { type: 'image/png' }), 'large.png');
    const largeResponse = await fetch(baseURL + prefix + '/events/' + state.event.id + '/poster?expectedVersion=' + state.event.contentVersion, {
      method: 'PUT', headers: { Authorization: 'Bearer ' + manager.accessToken, ...scope }, body: large });
    assert.notEqual(largeResponse.status, 413, 'a 2 MB poster must pass the gateway');
    state.largePoster = largeResponse.status;
    // Venue and performances through the API (the performance journey fixture covers the guided forms).
    const venue = (await organizer('/venues', { method: 'POST', expect: [200, 201], body: { name: 'Wave Arena', address: 'Wave Road', spaceName: 'Main hall' } })).data;
    const now = Date.now();
    const opens = new Date(now + 45_000).toISOString();
    const closes = new Date(now + 6 * 3_600_000).toISOString();
    state.opens = opens;
    const schedule = async (days) => {
      const starts = new Date(now + days * 86_400_000);
      return (await organizer('/events/' + state.event.id + '/performances', { method: 'POST', expect: [200, 201], body: {
        venueSpaceId: venue.spaces[0].id, startsAt: starts.toISOString(), endsAt: new Date(starts.getTime() + 3 * 3_600_000).toISOString(),
        timezone: 'Asia/Ho_Chi_Minh', saleStartAt: opens, saleEndAt: closes, maxPerAccount: 6, publicVisible: true } })).data;
    };
    state.p1 = await schedule(3);
    state.p2 = await schedule(4);
    state.p3 = await schedule(5);
    const release = async (show) => {
      const groups = [['Floor', 100000], ['Mezzanine', 120000]].map(([label]) => ({ id: randomUUID(), sectionId: null, sectionLabel: label, kind: 'GA', capacity: 40, seats: [] }));
      const offers = groups.map((group, index) => ({ id: randomUUID(), groupId: group.id, name: index ? 'Mezzanine pass' : 'Floor pass',
        price: index ? 120000 : 100000, currency: 'VND', saleStartAt: opens, saleEndAt: closes, active: true }));
      const sale = (await organizer('/performances/' + show.id + '/sale', { method: 'PUT', body: { expectedSaleVersion: 0, groups, offers } })).data;
      const current = (await organizer('/events/' + state.event.id)).data;
      const entry = current.performances.find((item) => item.id === show.id);
      const status = (await organizer('/performances/' + show.id + '/publication', { method: 'POST', body: {
        expectedSaleVersion: sale.version, expectedLayoutVersion: 0, expectedEventDraftVersion: current.draftVersion,
        expectedScheduleDraftVersion: entry.draftVersion, publishAt: new Date(Date.now() + 3_000).toISOString() } })).data;
      assert.equal(status.review.state, 'SUBMITTED');
      const decision = (await api('POST', '/api/admin/v2/performance-reviews/' + show.id, { token: admin.accessToken, body: { revision: status.review.id, action: 'APPROVE' } })).data;
      assert.equal(decision.state, 'SCHEDULED');
      await until(async () => {
        const publication = (await organizer('/performances/' + show.id + '/publication')).data;
        return publication.ticketingAcknowledged && publication.checkinAcknowledged;
      }, { seconds: 180, label: 'release acknowledgements' });
      return { offers, floor: offers[0], mezzanine: offers[1] };
    };
    state.p1.offers = await release(state.p1);
    state.p2.offers = await release(state.p2);
    const detail = (await api('GET', '/api/v2/events/' + state.event.id)).data;
    assert.deepEqual(new Set(detail.performances.map((item) => item.id)), new Set([state.p1.id, state.p2.id]));
    assert.equal(detail.ageRating, '16+');
    assert.equal(detail.refundPolicy, 'Full refund up to 7 days before the show.');
    assert.equal(detail.translations.vi.title, copy.vi.title);
    assert.ok(detail.artistBio.includes('Hanoi'));
    return { eventId: state.event.id, poster: state.poster, releasedPerformances: 2, contentOnBuyerApi: ['ageRating', 'refundPolicy', 'translations', 'artistBio'] };
  });
  console.log(JSON.stringify(state.poster));

  state.buyerText = async () => {
    const response = await api('GET', '/api/v2/events/' + state.event.id, { headers: { 'Accept-Language': 'en' } });
    return JSON.stringify(response.data);
  };

  // ---------- Flow 2: content revision after release ----------
  await flow(2, 'Content revision: staged, submitted, approved by Admin, then live', async () => {
    const page = mgr.page;
    const updated = 'Updated English description ' + suffix;
    await page.goto('/organizer/events/' + state.event.id + '?show=' + state.p1.id + '&step=event');
    await page.getByRole('button', { name: 'Edit details' }).click();
    await page.getByRole('group', { name: 'English' }).getByLabel('Description').fill(updated);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await page.getByRole('button', { name: 'Submit for review' }).click();
    await page.getByText('In review').first().waitFor();
    await shoot(page, 'event-details-revision');
    const before = await state.buyerText();
    assert.ok(before.includes(copy.en.description) && !before.includes(updated), 'buyer API must still show the old text');
    const buyerPage = await mgr.context.newPage();
    await buyerPage.goto('/events/' + state.event.id);
    await buyerPage.getByText(copy.en.description).first().waitFor();
    assert.equal(await buyerPage.getByText(updated).count(), 0);
    // Admin: Content changes tab.
    await adm.page.goto('/admin/event-review');
    await adm.page.getByRole('navigation', { name: 'Release queue sections' }).getByRole('link', { name: 'Content changes' }).click();
    await adm.page.getByText(title).first().waitFor().catch(async (error) => {
      console.log('DBG', adm.page.url(), (await adm.page.locator('main').innerText()).slice(0, 600));
      const queue = await api('GET', '/api/admin/v2/event-content-revisions?state=SUBMITTED', { token: admin.accessToken });
      console.log('DBGAPI', JSON.stringify(queue.data).slice(0, 800));
      throw error;
    });
    await adm.page.locator('summary', { hasText: title }).first().click();
    await adm.page.getByRole('button', { name: 'Approve changes' }).waitFor();
    await shoot(adm.page, 'content-changes-tab');
    await adm.page.getByRole('button', { name: 'Approve changes' }).click();
    await until(async () => (await state.buyerText()).includes(updated), { label: 'buyer API to show the approved text' });
    await buyerPage.reload();
    await buyerPage.getByText(updated).first().waitFor();
    assert.equal(await buyerPage.getByText(copy.en.description).count(), 0);
    await buyerPage.close();
    return { buyerBeforeApproval: 'old text', buyerAfterApproval: 'new text' };
  });

  // ---------- Flow 3: delete a draft performance; a released one is refused ----------
  await flow(3, 'Delete a draft performance; released performance refused', async () => {
    const page = mgr.page;
    await page.goto('/organizer/events/' + state.event.id + '?show=' + state.p3.id);
    await page.getByRole('button', { name: 'Delete draft performance' }).click();
    await shoot(page, 'delete-draft-confirm');
    await page.getByRole('alertdialog').getByRole('button', { name: 'Delete draft performance' }).click();
    await page.getByText('Draft performance deleted.').waitFor();
    const current = (await organizer('/events/' + state.event.id)).data;
    assert.ok(!current.performances.some((item) => item.id === state.p3.id), 'the draft is gone');
    assert.equal(current.performances.length, 2);
    // Released: no button, and the API refuses.
    await page.goto('/organizer/events/' + state.event.id + '?show=' + state.p1.id);
    await page.getByRole('navigation', { name: 'Concert preparation steps' }).waitFor();
    assert.equal(await page.getByRole('button', { name: 'Delete draft performance' }).count(), 0);
    const releasedEntry = current.performances.find((item) => item.id === state.p1.id);
    const refused = await organizer('/performances/' + state.p1.id, { method: 'DELETE', expect: [400, 409],
      headers: { ...scope }, body: undefined }).catch(async () => organizer('/performances/' + state.p1.id + '?expectedDraftVersion=' + releasedEntry.draftVersion, { method: 'DELETE', expect: [400, 409] }));
    return { draftDeleted: true, releasedDeleteStatus: refused.status, releasedDeleteButton: 'absent' };
  });

  // ---------- Flow 4: legacy concert is read-only for organizers ----------
  await flow(4, 'Legacy concert opens as a read-only summary; old routes redirect', async () => {
    const soon = Date.now();
    const legacy = (await api('POST', '/api/admin/concerts?organizationId=' + organization, { token: admin.accessToken, expect: [201], body: {
      title: 'Legacy concert ' + suffix, venueName: 'Old arena', venueAddress: 'Old road', eventDate: new Date(soon + 9 * 86_400_000).toISOString(),
      saleStartAt: new Date(soon + 86_400_000).toISOString(), saleEndAt: new Date(soon + 8 * 86_400_000).toISOString() } })).data;
    await api('POST', '/api/admin/concerts/' + legacy.id + '/ticket-types', { token: admin.accessToken, expect: [201],
      body: { name: 'Standard', price: 150000, totalQuantity: 30, maxPerAccount: 4, zoneColor: '#123456' } });
    state.legacy = legacy;
    const page = mgr.page;
    await page.goto('/organizer/concerts/' + legacy.id);
    await page.waitForURL(new RegExp('/organizer/events/' + legacy.id));
    await page.getByRole('heading', { name: 'Concert summary' }).waitFor();
    await page.getByText('Read only').first().waitFor();
    await page.getByText('Standard').first().waitFor();
    await shoot(page, 'legacy-read-only-summary');
    const redirected = new URL(page.url()).pathname;
    await page.goto('/organizer/concerts');
    await page.waitForURL('**/organizer/events');
    const write = await api('PUT', '/api/organizer/manage/concerts/' + legacy.id, { token: manager.accessToken, headers: { ...scope, 'Accept-Language': 'en' }, expect: [403], body: { title: 'Blocked edit' } });
    assert.match(JSON.stringify(write.payload), /created before the new event workspace/i);
    const admin403 = await api('PUT', '/api/admin/concerts/' + legacy.id, { token: admin.accessToken, expect: [200, 400, 409],
      body: { title: 'Legacy concert ' + suffix, venueName: 'Old arena', venueAddress: 'Old road', eventDate: legacy.eventDate, saleStartAt: legacy.saleStartAt, saleEndAt: legacy.saleEndAt } });
    return { redirectedTo: redirected, organizerWriteStatus: write.status, adminWriteStatus: admin403.status };
  });

  // ---------- Flow 5: guests for the released performance ----------
  await flow(5, 'Import guests for a released performance through the Guests step', async () => {
    const page = mgr.page;
    await page.goto('/organizer/events/' + state.p1.eventId.replace(/.*/, state.event.id) + '?show=' + state.p1.id + '&step=guests');
    const csv = 'phone,full_name,category,sponsor_name,notes\n0901234567,Nguyen Anh,VIP,Partner,wave1\n0907654321,Tran Binh,Press,Media,wave1\n';
    await page.locator('input[type="file"]').setInputFiles({ name: 'guests.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.locator('form button[type="submit"]').click();
    const entries = await until(async () => {
      const list = (await api('GET', '/api/organizer/manage/concerts/' + state.p1.id + '/guest-lists', { token: manager.accessToken, headers: scope })).data;
      return list.content.length === 2 ? list : null;
    }, { seconds: 120, label: 'guest import to finish' });
    await page.getByText('guests.csv').first().waitFor();
    await page.keyboard.press('Escape');
    await page.getByRole('dialog').waitFor({ state: 'hidden' }).catch(() => undefined);
    await page.waitForTimeout(1500);
    await shoot(page, 'guests-step');
    return { guestsImported: entries.content.length };
  });

  // ---------- Flow 6: purchases, refund, and sales reporting by role ----------
  const money = {};
  await flow(6, 'Two performances sold, one order refunded, sales figures by role, CSV and PDF exports', async () => {
    const buyOrder = async (show, items) => {
      const queue = '/api/queue/concerts/' + show.id;
      await api('POST', queue + '/join', { token: buyer.accessToken });
      const access = await until(async () => (await api('GET', queue + '/status', { token: buyer.accessToken })).data.queueAccessToken, { label: 'queue access' });
      const sale = '/api/v2/performances/' + show.id;
      const hold = (await api('PUT', sale + '/hold', { token: buyer.accessToken, headers: { 'Queue-Access-Token': access, 'Idempotency-Key': randomUUID() },
        body: { layoutVersion: null, holdVersion: 0, items } })).data;
      const order = (await api('POST', sale + '/orders', { token: buyer.accessToken, expect: [201], headers: { 'Queue-Access-Token': access, 'Idempotency-Key': randomUUID() },
        body: { holdVersion: hold.version } })).data;
      await until(async () => (await api('POST', '/api/payments/' + order.id + '/initiate', { token: buyer.accessToken, body: { provider: 'MOCK' }, expect: [200, 202, 429] })).status !== 429, { label: 'payment intent' });
      await until(async () => (await api('GET', '/api/payments/' + order.id + '/status', { token: buyer.accessToken, expect: [200, 429] })).data.attemptState === 'READY', { label: 'payment ready' });
      await until(async () => {
        await api('POST', '/api/mock-payments/' + order.id + '/success', { token: buyer.accessToken, expect: [200, 429] });
        return sql('ticketing', "SELECT status FROM orders WHERE id='" + order.id + "'") === 'PAID';
      }, { label: 'paid order' });
      return order;
    };
    await until(() => Date.now() > Date.parse(state.opens), { seconds: 90, label: 'sale to open' });
    const [floor1, mezz1] = [state.p1.offers.floor, state.p1.offers.mezzanine];
    const [floor2, mezz2] = [state.p2.offers.floor, state.p2.offers.mezzanine];
    const orderA = await buyOrder(state.p1, [{ offerId: floor1.id, quantity: 2 }, { offerId: mezz1.id, quantity: 1 }]);
    const orderB = await buyOrder(state.p2, [{ offerId: floor2.id, quantity: 2 }]);
    const orderC = await buyOrder(state.p2, [{ offerId: mezz2.id, quantity: 1 }]);
    // Admin requests, a second Admin approves and confirms the refund with simulated evidence (as scripts/e2e/split.py does).
    const path = '/api/admin/orders/' + orderB.id + '/refunds';
    const action = (kind, extra = {}) => ({ actionId: randomUUID(), action: kind, detail: 'Wave 1 walkthrough refund', ...extra });
    const requested = (await api('POST', path, { token: admin.accessToken, body: action('REQUEST') })).data;
    assert.equal(requested.state, 'REQUESTED');
    const approval = action('APPROVE', { caseId: requested.id });
    await until(async () => (await api('POST', path, { token: secondAdmin.accessToken, body: approval, expect: [200, 409, 503] })).data.state === 'APPROVED', { seconds: 120, label: 'refund approval' });
    const confirmation = action('CONFIRM', { caseId: requested.id, amount: requested.amount, externalReference: 'WAVE1-' + suffix, occurredAt: new Date().toISOString() });
    assert.equal((await api('POST', path, { token: secondAdmin.accessToken, body: confirmation })).data.state, 'RESOLVED_MANUALLY');
    await until(() => sql('ticketing', "SELECT status FROM orders WHERE id='" + orderB.id + "'") === 'REFUNDED', { label: 'refunded order' });
    const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date());
    const from = new Date(Date.parse(today) - 6 * 86_400_000).toISOString().slice(0, 10);
    const range = 'from=' + from + '&to=' + today;
    const sales = (token, path2) => api('GET', '/api/organizer/sales' + path2, { token, headers: scope, expect: [200, 403] });
    const expected = { gross: 640000, refunds: 200000, net: 440000, sold: 6, refunded: 2, netTickets: 4 };
    const summary = await until(async () => {
      const result = (await sales(members.FINANCE.accessToken, '/summary?' + range)).data;
      return result.refunds === expected.refunds ? result : null;
    }, { seconds: 60, label: 'ledger to record the refund' });
    assert.equal(summary.grossSales, expected.gross);
    assert.equal(summary.refunds, expected.refunds);
    assert.equal(summary.netSales, expected.net);
    assert.equal(summary.ticketsSold, expected.sold);
    assert.equal(summary.ticketsRefunded, expected.refunded);
    assert.equal(summary.netTickets, expected.netTickets);
    const eventsOnly = (await sales(members.EVENTS.accessToken, '/summary?' + range)).data;
    assert.equal(eventsOnly.ticketsSold, expected.sold);
    assert.equal(eventsOnly.netTickets, expected.netTickets);
    for (const key of ['grossSales', 'refunds', 'netSales']) assert.equal(key in eventsOnly, false, key + ' must be absent without FINANCE');
    assert.ok(eventsOnly.capacity === undefined || eventsOnly.capacity >= 0);
    const byShow = (await sales(members.FINANCE.accessToken, '/breakdown?by=performance&' + range)).data.rows;
    const rowFor = (id) => byShow.find((row) => row.performanceId === id);
    assert.deepEqual([rowFor(state.p1.id).grossSales, rowFor(state.p1.id).refunds, rowFor(state.p1.id).netSales], [320000, 0, 320000]);
    assert.deepEqual([rowFor(state.p2.id).grossSales, rowFor(state.p2.id).refunds, rowFor(state.p2.id).netSales], [320000, 200000, 120000]);
    const byOffer = (await sales(members.FINANCE.accessToken, '/breakdown?by=offer&performanceId=' + state.p2.id + '&' + range)).data.rows;
    assert.deepEqual(byOffer.map((row) => [row.label, row.netSales]).sort(), [['Floor pass', 0], ['Mezzanine pass', 120000]]);
    const eventsBreakdown = (await sales(members.EVENTS.accessToken, '/breakdown?by=performance&' + range)).data.rows;
    assert.ok(eventsBreakdown.every((row) => !('grossSales' in row) && !('netSales' in row) && typeof row.netTickets === 'number'));
    for (const format of ['csv', 'pdf']) {
      const exported = await fetch(baseURL + '/api/organizer/sales/export?format=' + format + '&' + range, { headers: { Authorization: 'Bearer ' + members.FINANCE.accessToken, ...scope } });
      assert.equal(exported.status, 200, format + ' export');
      const bytes = Buffer.from(await exported.arrayBuffer());
      if (format === 'csv') assert.ok(bytes.toString('utf8').includes('440000') || bytes.toString('utf8').includes('440,000'), 'CSV contains the net total');
      else assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
      money[format] = bytes.length;
      const denied = await sales(members.EVENTS.accessToken, '/export?format=' + format + '&' + range);
      assert.equal(denied.status, 403);
    }
    Object.assign(state, { range, from, today });
    return { orders: [orderA.referenceCode, orderB.referenceCode, orderC.referenceCode], financeSummary: { gross: summary.grossSales, refunds: summary.refunds, net: summary.netSales, ticketsSold: summary.ticketsSold, ticketsRefunded: summary.ticketsRefunded, netTickets: summary.netTickets },
      eventsOnlyHasMoney: false, eventsOnlyTickets: { sold: eventsOnly.ticketsSold, net: eventsOnly.netTickets }, exportBytes: money, eventsExport: 403 };
  });

  // ---------- Flow 6b / 7: sales UI by role, Overview, directory, screenshots ----------
  await flow('6ui', 'Reports > Sales and Overview in the browser: FINANCE shows money and exports, EVENTS-only shows tickets only', async () => {
    const finance = await session(members.FINANCE, organization);
    const events = await session(members.EVENTS, organization);
    const url = '/organizer/reports?view=sales&eventId=' + state.event.id;
    await finance.page.goto(url);
    const summary = finance.page.getByLabel('Sales summary');
    await summary.getByText('Net sales', { exact: true }).waitFor();
    await finance.page.waitForTimeout(1500);
    const financeText = await summary.innerText();
    assert.match(financeText, /440[.,\s]?000/);
    assert.match(financeText, /640[.,\s]?000/);
    assert.match(financeText, /200[.,\s]?000/);
    await finance.page.getByRole('table').first().waitFor();
    const csv = finance.page.waitForEvent('download');
    await finance.page.getByRole('button', { name: 'Export CSV' }).click();
    const csvDownload = await csv;
    const pdf = finance.page.waitForEvent('download');
    await finance.page.getByRole('button', { name: 'Export PDF' }).click();
    const pdfDownload = await pdf;
    await shoot(finance.page, 'sales-report-finance');
    await events.page.goto(url);
    await events.page.getByLabel('Sales summary').waitFor();
    await events.page.waitForTimeout(1500);
    const eventsText = await events.page.locator('main').innerText();
    assert.doesNotMatch(eventsText, /₫|VND|Net sales|Gross sales/);
    assert.match(eventsText, /Tickets sold/i);
    assert.equal(await events.page.getByRole('button', { name: /Export/ }).count(), 0);
    await shoot(events.page, 'sales-report-events-only');
    await mgr.page.goto('/organizer');
    await mgr.page.getByRole('heading', { name: 'Sales', exact: true }).first().waitFor();
    await mgr.page.waitForTimeout(2000);
    const overviewFinance = await mgr.page.locator('main').innerText();
    assert.match(overviewFinance, /440[.,\s]?000/);
    await shoot(mgr.page, 'overview-finance');
    await events.page.goto('/organizer');
    await events.page.getByRole('heading', { name: 'Sales', exact: true }).first().waitFor();
    await events.page.waitForTimeout(2000);
    const overviewEvents = await events.page.locator('main').innerText();
    assert.doesNotMatch(overviewEvents, /₫|VND/);
    assert.match(overviewEvents, /tickets/i);
    await shoot(events.page, 'overview-events-only');
    // Directory with the status filter.
    await mgr.page.goto('/organizer/events');
    await mgr.page.getByRole('link', { name: new RegExp(title) }).first().waitFor();
    const directory = async (status) => {
      const list = (await organizer('/event-directory?status=' + status + '&size=50')).data.content;
      return list.some((entry) => entry.id === state.event.id);
    };
    assert.equal(await directory('ON_SALE'), true);
    assert.equal(await directory('PAST'), false);
    assert.equal(await directory('DRAFT'), false);
    await shoot(mgr.page, 'directory');
    await finance.context.close();
    await events.context.close();
    return { csvFile: csvDownload.suggestedFilename(), pdfFile: pdfDownload.suggestedFilename(), directoryFilter: 'ON_SALE yes, PAST no, DRAFT no' };
  });
} catch (error) {
  results.push({ id: 'setup', name: 'Setup', status: 'fail', error: String(error.stack ?? error) });
  console.log('SETUP FAIL', error);
} finally {
  await writeFile(report + '/organizer-wave1.json', JSON.stringify({ results, state: { eventId: state.event?.id, poster: state.poster } }, null, 2));
  await browser.close();
}
if (results.some((entry) => entry.status !== 'pass')) process.exitCode = 1;
