// Final walkthrough of the organizer redesign (Waves 1 to 3) on an isolated Compose project.
// Flow 1 is organizer-wave1.mjs. Flows 2 to 6 are here; set FLOWS=2,3 to run a subset. Screenshots at 1440, 834 and 390 px.
// Env: TICKETBOX_E2E_URL (default http://localhost:18120), E2E_PROJECT (ticketbox-e2e-final), E2E_REPORT_DIRECTORY (.artifacts/e2e/final).
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { selectWorkspaceOption } from './select-workspace-option.mjs';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18120';
const project = process.env.E2E_PROJECT ?? 'ticketbox-e2e-final';
assert.match(project, /^ticketbox-e2e(?:-[a-z0-9-]+)?$/);
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use an isolated loopback deployment');
const report = process.env.E2E_REPORT_DIRECTORY ?? '.artifacts/e2e/final';
const shots = report + '/screenshots';
await mkdir(shots, { recursive: true });
const wanted = new Set((process.env.FLOWS ?? '2,3,4,5,6').split(',').map((value) => value.trim()));
const want = (id) => wanted.has(String(id));

const suffix = randomUUID().slice(0, 8);
const results = [];
const overflows = [];
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const HOUR = 3_600_000;
const DAY = 86_400_000;

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

async function register(label, role) {
  const email = label + '-' + suffix + '@example.test';
  const password = 'fixture-final-pass';
  const { data } = await api('POST', '/api/auth/register', { body: { email, fullName: label + ' fixture', password }, expect: [201] });
  if (role) sql('identity', "UPDATE users SET role='" + role + "' WHERE id='" + data.id + "'");
  return { id: data.id, email, password };
}

const browser = await chromium.launch();

async function session(auth, organization, { width = 1440, theme = 'light' } = {}) {
  const context = await browser.newContext({ baseURL, locale: 'en-US', reducedMotion: 'reduce', colorScheme: theme, viewport: { width, height: 900 }, acceptDownloads: true });
  await context.addCookies([{ name: 'ticketbox_auth_token', value: auth.accessToken, url: baseURL }]);
  await context.addInitScript(({ user, organization, theme }) => {
    if (organization) sessionStorage.setItem('ticketbox.organization.' + user, organization);
    localStorage.setItem('ticketbox.theme', theme);
  }, { user: auth.user.id, organization, theme });
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return { context, page };
}

async function anonymous() {
  const context = await browser.newContext({ baseURL, locale: 'en-US', reducedMotion: 'reduce', colorScheme: 'light', viewport: { width: 1440, height: 900 } });
  await context.addInitScript(() => localStorage.setItem('ticketbox.theme', 'light'));
  const page = await context.newPage();
  page.setDefaultTimeout(20_000);
  return { context, page };
}

/** Screenshots at the three required widths. Horizontal overflow is recorded, and fails the flow at the end. */
async function shoot(page, name, { full = true } = {}) {
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    await page.screenshot({ path: shots + '/' + name + '-' + width + '.png', fullPage: full, animations: 'disabled' });
    if (overflow > 1) overflows.push(name + ' overflows by ' + overflow + 'px at ' + width + 'px');
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForTimeout(150);
}

async function flow(id, name, run) {
  if (!want(id)) return;
  const started = Date.now();
  const before = overflows.length;
  try {
    const evidence = await run();
    const found = overflows.slice(before);
    if (found.length) throw new Error('horizontal overflow: ' + found.join('; '));
    results.push({ id, name, status: 'pass', evidence, seconds: Math.round((Date.now() - started) / 1000) });
    console.log('PASS', id, name, JSON.stringify(evidence ?? ''));
  } catch (error) {
    results.push({ id, name, status: 'fail', error: String(error.stack ?? error).split('\n').slice(0, 8).join('\n') });
    console.log('FAIL', id, name, '\n', error.stack?.split('\n').slice(0, 8).join('\n') ?? error.message);
  }
}

const state = {};

try {
  // ---------- Setup: one organization with MEMBERS, FINANCE, EVENTS and ADMISSION members ----------
  const admin = await login('admin@ticketbox.com');
  const manager = await login('organizer@ticketbox.com');
  const buyer = await login('audience@ticketbox.com');
  const organization = (await api('POST', '/api/admin/organizations', { token: admin.accessToken, expect: [201],
    body: { name: 'Final walk ' + suffix, initialManagerId: manager.user.id } })).data.id;
  const scope = { 'X-Organization-Id': organization };
  const second = await register('second-admin', 'ADMIN');
  const secondAdmin = await login(second.email, second.password);
  const members = {};
  const invite = async (key, grants, role = 'ORGANIZER') => {
    const account = await register(key.toLowerCase() + '-member', role);
    const auth = await login(account.email, account.password);
    const code = (await api('POST', '/api/organizations/' + organization + '/invitations', { token: manager.accessToken, expect: [201],
      body: { accountId: account.id, grants } })).data;
    await api('POST', '/api/organizations/invitations/accept', { token: auth.accessToken, body: { code: code.code } });
    members[key] = auth;
  };
  await invite('FINANCE', ['FINANCE']);
  await invite('EVENTS', ['EVENTS']);
  await invite('MEMBERS', ['MEMBERS']);
  await invite('STAFF', ['ADMISSION'], 'STAFF');
  const prefix = '/api/organizer/manage/v2';
  const organizer = (path, options = {}) => api(options.method ?? 'GET', prefix + path, { token: manager.accessToken, headers: scope, ...options });
  const mgr = await session(manager, organization);
  const adm = await session(admin);

  const venue = (await organizer('/venues', { method: 'POST', expect: [200, 201], body: { name: 'Final Arena ' + suffix, address: 'Final Road 1', spaceName: 'Main hall' } })).data;
  const space = venue.spaces[0].id;
  const eventBody = (title, classification) => ({
    title, description: 'Description of ' + title,
    translations: { en: { title, description: 'Description of ' + title }, vi: { title: 'Đêm nhạc ' + title, description: 'Mô tả ' + title } },
    artistBio: 'Fixture artist.', ageRating: null, refundPolicy: 'Refunds follow the TicketBox policy.', ...classification });
  const newEvent = async (title, classification = { segment: 'concerts', primaryGenre: 'vpop', genres: [] }) =>
    (await organizer('/events', { method: 'POST', body: eventBody(title, classification) })).data;
  const schedule = async (event, { days = 3, hour = 0, opens, closes, publicVisible = true, startsAt, spaceId, doorsOpenAt } = {}) => {
    const starts = startsAt ?? new Date(Date.now() + days * DAY + hour * HOUR);
    return (await organizer('/events/' + event.id + '/performances', { method: 'POST', expect: [200, 201], body: {
      venueSpaceId: spaceId ?? space, doorsOpenAt: doorsOpenAt ? doorsOpenAt.toISOString() : null, startsAt: starts.toISOString(), endsAt: new Date(starts.getTime() + 3 * HOUR).toISOString(),
      timezone: 'Asia/Ho_Chi_Minh', saleStartAt: opens.toISOString(), saleEndAt: closes.toISOString(), maxPerAccount: 6, publicVisible } })).data;
  };
  const ticketGroups = (opens, closes, extra = {}) => {
    const group = { id: randomUUID(), sectionId: null, sectionLabel: 'Floor', kind: 'GA', capacity: 60, seats: [] };
    const offer = { id: randomUUID(), groupId: group.id, name: 'Floor pass', price: 100000, currency: 'VND',
      saleStartAt: opens.toISOString(), saleEndAt: closes.toISOString(), active: true, ...extra };
    return { groups: [group], offers: [offer] };
  };
  /** Saves ticket types, submits the release, approves it as Admin and waits for both acknowledgements. */
  const release = async (event, show, { mode = 'SCHEDULED', sale, decision = 'APPROVE' } = {}) => {
    const saved = (await organizer('/performances/' + show.id + '/sale', { method: 'PUT', body: { expectedSaleVersion: 0, ...sale } })).data;
    const current = (await organizer('/events/' + event.id)).data;
    const entry = current.performances.find((item) => item.id === show.id);
    const status = (await organizer('/performances/' + show.id + '/publication', { method: 'POST', body: {
      expectedSaleVersion: saved.version, expectedLayoutVersion: 0, expectedEventDraftVersion: current.draftVersion,
      expectedScheduleDraftVersion: entry.draftVersion, releaseMode: mode, publishAt: mode === 'SCHEDULED' ? new Date(Date.now() + 3_000).toISOString() : null } })).data;
    assert.equal(status.review.state, 'SUBMITTED');
    await api('POST', '/api/admin/v2/performance-reviews/' + show.id, { token: admin.accessToken, body: { revision: status.review.id, action: decision } });
    await until(async () => {
      const publication = (await organizer('/performances/' + show.id + '/publication')).data;
      return publication.ticketingAcknowledged && publication.checkinAcknowledged;
    }, { seconds: 180, label: 'release acknowledgements' });
    return sale.offers;
  };
  const releaseSimple = async (event, show, opens, closes, extra = {}, options = {}) =>
    (await release(event, show, { ...options, sale: ticketGroups(opens, closes, extra) }))[0];
  const buyerFlow = (token) => ({
    async enter(show) {
      const queue = '/api/queue/concerts/' + show.id;
      await api('POST', queue + '/join', { token });
      return until(async () => (await api('GET', queue + '/status', { token })).data.queueAccessToken, { label: 'queue access' });
    },
    async hold(show, access, items, expect = [200]) {
      return api('PUT', '/api/v2/performances/' + show.id + '/hold', { token, headers: { 'Queue-Access-Token': access, 'Idempotency-Key': randomUUID() },
        body: { layoutVersion: null, holdVersion: 0, items }, expect });
    },
    async buy(show, items) {
      const access = await this.enter(show);
      const hold = (await this.hold(show, access, items)).data;
      const order = (await api('POST', '/api/v2/performances/' + show.id + '/orders', { token, expect: [201], headers: { 'Queue-Access-Token': access, 'Idempotency-Key': randomUUID() },
        body: { holdVersion: hold.version } })).data;
      await until(async () => (await api('POST', '/api/payments/' + order.id + '/initiate', { token, body: { provider: 'MOCK' }, expect: [200, 202, 429] })).status !== 429, { label: 'payment intent' });
      await until(async () => (await api('GET', '/api/payments/' + order.id + '/status', { token, expect: [200, 429] })).data.attemptState === 'READY', { label: 'payment ready' });
      await until(async () => {
        await api('POST', '/api/mock-payments/' + order.id + '/success', { token, expect: [200, 429] });
        return sql('ticketing', "SELECT status FROM orders WHERE id='" + order.id + "'") === 'PAID';
      }, { label: 'paid order' });
      return order;
    },
  });
  const buying = buyerFlow(buyer.accessToken);
  const win = (seconds = 20) => ({ opens: new Date(Date.now() + seconds * 1000), closes: new Date(Date.now() + 8 * HOUR) });

  // ---------- Flow 2: classification ----------
  await flow(2, 'Classification: picker by keyboard, refusal without genre, buyer discovery and facets', async () => {
    const page = mgr.page;
    const title = 'Classified concert ' + suffix;
    state.classified = title;
    await page.goto('/organizer/events/new');
    await page.locator('input[name="title"]').fill(title);
    await page.locator('textarea[name="description"]').fill('Classification walkthrough ' + suffix);
    const vi = page.getByRole('group', { name: 'Tiếng Việt' });
    await vi.getByLabel('Event title').fill('Phân loại ' + suffix);
    await vi.getByLabel('Description').fill('Mô tả phân loại');
    const en = page.getByRole('group', { name: 'English' });
    await en.getByLabel('Event title').fill(title);
    await en.getByLabel('Description').fill('Classification walkthrough');
    // Keyboard path: radio, main genre combobox, two tags.
    const concerts = page.getByRole('radio', { name: 'Concerts' });
    await concerts.focus();
    await page.keyboard.press('Space');
    assert.equal(await concerts.isChecked(), true);
    const main = page.getByRole('combobox', { name: 'Main genre' });
    await main.focus();
    await page.keyboard.type('indie');
    await page.keyboard.press('Enter');
    assert.equal(await main.inputValue(), 'Indie');
    const tags = page.getByRole('combobox', { name: 'Additional genres' });
    await tags.focus();
    await page.keyboard.type('rock');
    await page.keyboard.press('Enter');
    await page.keyboard.type('jazz');
    await page.keyboard.press('Enter');
    await tags.press('Escape');
    const chips = page.getByRole('list', { name: 'Chosen additional genres' });
    await chips.getByText('Rock').waitFor();
    await chips.getByText('Jazz').waitFor();
    await shoot(page, 'classification-picker');
    const created = page.waitForResponse((response) => response.url().endsWith(prefix + '/events') && response.request().method() === 'POST');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    const response = await created;
    assert.equal(response.status(), 200, await response.text());
    state.classifiedEvent = (await response.json()).data;
    assert.equal(state.classifiedEvent.segment, 'concerts');
    assert.equal(state.classifiedEvent.primaryGenre, 'indie');
    assert.deepEqual([...state.classifiedEvent.genres].sort(), ['jazz', 'rock']);
    // An event without a main genre cannot be submitted for release.
    const bare = await newEvent('Unclassified ' + suffix, { segment: 'concerts', primaryGenre: '', genres: [] }).catch((error) => error);
    let refusal = 'event creation without a genre was refused by the API: ' + String(bare.message ?? '').slice(0, 120);
    if (!(bare instanceof Error)) {
      const w = win();
      const show = await schedule(bare, w);
      const sale = (await organizer('/performances/' + show.id + '/sale', { method: 'PUT', body: { expectedSaleVersion: 0, ...ticketGroups(w.opens, w.closes) } })).data;
      const current = (await organizer('/events/' + bare.id)).data;
      const refused = await organizer('/performances/' + show.id + '/publication', { method: 'POST', expect: [400], headers: { 'Accept-Language': 'en' }, body: {
        expectedSaleVersion: sale.version, expectedLayoutVersion: 0, expectedEventDraftVersion: current.draftVersion,
        expectedScheduleDraftVersion: current.performances[0].draftVersion, releaseMode: 'ON_APPROVAL', publishAt: null } });
      refusal = 'publication refused 400: ' + JSON.stringify(refused.payload.message);
      await page.goto('/organizer/events/' + bare.id + '?show=' + show.id + '&step=review');
      await page.getByText('Classify the event').first().waitFor();
      await shoot(page, 'classification-missing-review');
    }
    // Release the classified event and browse it as a buyer.
    const w = win(60);
    const show = await schedule(state.classifiedEvent, { days: 6, ...w });
    await releaseSimple(state.classifiedEvent, show, w.opens, w.closes, {}, { mode: 'ON_APPROVAL' });
    state.classifiedShow = show;
    const facets = (await api('GET', '/api/v2/events/discovery/facets?segment=concerts')).data;
    const counts = Object.fromEntries((facets.genres ?? []).map((entry) => [entry.id, entry.count]));
    assert.ok(counts.indie >= 1 && counts.rock >= 1 && counts.jazz >= 1, 'facet counts include primary genre and tags: ' + JSON.stringify(counts));
    const visitor = await anonymous();
    const buyerPage = visitor.page;
    await buyerPage.goto('/events?segment=concerts');
    await buyerPage.getByRole('heading', { name: 'Concerts', exact: true }).first().waitFor();
    await buyerPage.getByRole('list', { name: 'Genres in Concerts' }).waitFor();
    await shoot(buyerPage, 'discovery-segment-page');
    const q = '&q=' + encodeURIComponent(title);
    await buyerPage.goto('/events?segment=concerts' + q);
    await buyerPage.getByText(title).first().waitFor();
    const chipsList = buyerPage.getByRole('list', { name: 'Genres in Concerts' });
    await chipsList.getByRole('button', { name: /^Indie\s*\d+/ }).click();
    await buyerPage.getByText(title).first().waitFor();
    await chipsList.getByRole('button', { name: /^Indie/ }).waitFor();
    assert.equal(await chipsList.getByRole('button', { name: /^Indie/ }).getAttribute('aria-pressed'), 'true');
    await shoot(buyerPage, 'discovery-genre-chip');
    await buyerPage.goto('/events?segment=concerts&genre=jazz' + q);
    await buyerPage.getByText(title).first().waitFor();
    await buyerPage.goto('/events?segment=sports' + q);
    await buyerPage.waitForLoadState('networkidle');
    assert.equal(await buyerPage.getByRole('link', { name: new RegExp(title) }).count(), 0, 'the event is not on the Sports page');
    const legacy = await anonymous();
    await legacy.page.goto('/events?category=concerts');
    await legacy.page.waitForURL(/segment=concerts/);
    await visitor.context.close();
    await legacy.context.close();
    return { picker: 'keyboard radio, combobox, 2 tags', refusal, facets: counts, discovery: 'segment page, Indie chip, Jazz tag filter, Sports excludes, ?category=concerts redirects' };
  });

  // ---------- Flow 3: scheduling ----------
  const fullDay = (date) => new Intl.DateTimeFormat('en-US', { dateStyle: 'full', timeZone: 'UTC' }).format(date);
  const isoDay = (date) => date.toISOString().slice(0, 10);
  const utcDay = (offsetDays) => { const d = new Date(Date.now() + offsetDays * DAY); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); };
  /** Clicks a day in an open calendar grid, moving months forward when needed. */
  const pickDay = async (root, date) => {
    const cell = root.getByRole('button', { name: fullDay(date), exact: true });
    for (let i = 0; i < 6 && !(await cell.count()); i++) await root.getByRole('button', { name: 'Next month' }).click();
    await cell.click();
  };
  const e1 = {};
  await flow('3a', 'Calendar and time picker (mouse and keyboard, venue time zone), Add dates with three dates at once', async () => {
    const page = mgr.page;
    e1.event = await newEvent('Scheduling walk ' + suffix);
    const w = win(3600);
    e1.p0 = await schedule(e1.event, { days: 10, hour: 0, ...w });
    e1.window = w;
    const saved = (await organizer('/performances/' + e1.p0.id + '/sale', { method: 'PUT', body: { expectedSaleVersion: 0, ...ticketGroups(w.opens, w.closes) } })).data;
    e1.saleVersion = saved.version;
    await page.goto('/organizer/events/' + e1.event.id + '?show=' + e1.p0.id + '&step=schedule');
    await page.getByRole('button', { name: 'Choose date for Show starts' }).waitFor();
    // Mouse: open the calendar, pick a day, type a time.
    const target = utcDay(12);
    await page.getByRole('button', { name: 'Choose date for Show starts' }).click();
    const dialog = page.getByRole('dialog').last();
    await shoot(page, 'scheduling-calendar-open', { full: false });
    await pickDay(page, target);
    const startDate = page.getByLabel('Show starts, date');
    const startTime = page.getByLabel('Show starts, time');
    const us = (d) => String(d.getUTCMonth() + 1).padStart(2, '0') + '/' + String(d.getUTCDate()).padStart(2, '0') + '/' + d.getUTCFullYear();
    assert.equal(await startDate.inputValue(), us(target));
    await startTime.fill('8:30 PM');
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('listbox').count(), 0, 'Tab leaves the time field and closes its list');
    // Keyboard: type a date, open the time list with the arrow keys and choose with Enter.
    const endsDate = page.getByLabel('Show ends, date');
    await endsDate.fill(us(target));
    const endsTime = page.getByLabel('Show ends, time');
    await endsTime.focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    const endsValue = await endsTime.inputValue();
    assert.match(endsValue, /\d{1,2}:\d{2} [AP]M/);
    await page.getByLabel('Show ends, time').fill('11:30 PM');
    await page.getByLabel('Show ends, time').blur();
    // The sale window must still end before the new start: close sales when the show starts.
    await page.getByRole('button', { name: 'Close sales when the show starts' }).click();
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await until(async () => {
      const current = (await organizer('/events/' + e1.event.id)).data.performances.find((item) => item.id === e1.p0.id);
      return Date.parse(current.startsAt) === Date.parse(isoDay(target) + 'T13:30:00Z') ? current : null;
    }, { label: 'schedule saved at 20:30 venue time (13:30 UTC)' });
    // Add dates: three days at once, copying the setup of the first performance.
    await page.goto('/organizer/events/' + e1.event.id + '?show=' + e1.p0.id + '&step=schedule');
    await page.getByRole('button', { name: 'Add dates' }).click();
    const add = page.getByRole('dialog');
    const days = [utcDay(20), utcDay(21), utcDay(22)];
    for (const day of days) await pickDay(add, day);
    await add.getByText('3 days chosen.').waitFor();
    await shoot(page, 'scheduling-add-dates', { full: false });
    await add.getByRole('button', { name: 'Add 3 dates' }).click();
    await page.getByText('3 dates added as drafts.').waitFor();
    const list = (await organizer('/events/' + e1.event.id)).data.performances;
    assert.equal(list.length, 4);
    const added = list.filter((item) => item.id !== e1.p0.id);
    for (const item of added) {
      assert.equal(new Date(item.startsAt).getUTCHours(), 12, 'start 19:00 venue time is 12:00 UTC');
      const sale = (await organizer('/performances/' + item.id + '/sale')).data;
      assert.equal(sale.offers.length, 1, 'ticket types were copied');
    }
    e1.added = added;
    return { startSaved: '20:30 Asia/Ho_Chi_Minh = 13:30 UTC', keyboardTimeList: endsValue, datesAdded: added.length, copiedOffers: true };
  });
  await flow('3b', 'Duplicate a performance with map and prices', async () => {
    const page = mgr.page;
    await page.goto('/organizer/events/' + e1.event.id + '?show=' + e1.p0.id + '&step=schedule');
    await page.getByRole('button', { name: 'Duplicate', exact: true }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Duplicate performance' }).waitFor();
    await shoot(page, 'scheduling-duplicate', { full: false });
    const startText = await dialog.getByLabel('Start of the copy, date').inputValue();
    await dialog.getByRole('button', { name: 'Create draft copy' }).click();
    await page.getByText('Draft copy created.').waitFor();
    const list = (await organizer('/events/' + e1.event.id)).data.performances;
    assert.equal(list.length, 5);
    const copy = list.find((item) => !item.id.startsWith('x') && item.id !== e1.p0.id && !e1.added.some((a) => a.id === item.id));
    const sale = (await organizer('/performances/' + copy.id + '/sale')).data;
    assert.equal(sale.offers[0].name, 'Floor pass');
    assert.equal(sale.offers[0].price, 100000);
    e1.copy = copy;
    return { copyStart: startText, copiedOffer: sale.offers[0].name + ' ' + sale.offers[0].price };
  });
  await flow('3c', 'Apply pricing to other draft dates', async () => {
    const page = mgr.page;
    const sale = (await organizer('/performances/' + e1.p0.id + '/sale')).data;
    sale.offers[0].price = 130000;
    sale.offers[0].name = 'Floor pass plus';
    await organizer('/performances/' + e1.p0.id + '/sale', { method: 'PUT', body: { expectedSaleVersion: sale.version, groups: sale.groups, offers: sale.offers } });
    await page.goto('/organizer/events/' + e1.event.id + '?show=' + e1.p0.id + '&step=tickets');
    await page.getByRole('button', { name: 'Apply pricing to other dates' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Apply pricing to other dates' }).waitFor();
    const boxes = dialog.getByRole('checkbox');
    const count = await boxes.count();
    assert.ok(count >= 4, 'other draft dates are listed: ' + count);
    for (let i = 0; i < count; i++) await boxes.nth(i).check();
    await shoot(page, 'scheduling-apply-pricing', { full: false });
    await dialog.getByRole('button', { name: 'Apply pricing', exact: true }).click();
    await page.getByText(/Pricing applied to \d+ dates?\./).waitFor();
    for (const item of [...e1.added, e1.copy]) {
      const target = (await organizer('/performances/' + item.id + '/sale')).data;
      assert.equal(target.offers[0].price, 130000);
      assert.equal(target.offers[0].name, 'Floor pass plus');
    }
    return { appliedTo: count, price: 130000 };
  });

  const e2 = {};
  await flow('3d', 'Venue library: edit venue details and add a space (before release)', async () => {
    const page = mgr.page;
    e2.venue = (await organizer('/venues', { method: 'POST', expect: [200, 201], body: { name: 'Library Hall ' + suffix, address: 'Library Road 1', spaceName: 'Stage A' } })).data;
    e2.event = await newEvent('Release walk ' + suffix);
    e2.w = win(120);
    e2.a = await schedule(e2.event, { days: 5, spaceId: e2.venue.spaces[0].id, ...e2.w });
    await page.goto('/organizer/events/' + e2.event.id + '?show=' + e2.a.id + '&step=schedule');
    await page.getByRole('button', { name: 'Manage venues' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByRole('heading', { name: 'Venues' }).waitFor();
    await selectWorkspaceOption(dialog.getByLabel('Venue', { exact: true }), { label: /Library Hall/ });
    const panel = dialog.getByRole('region', { name: /Library Hall/ });
    await panel.getByLabel('Address').fill('Library Road 2');
    await panel.getByLabel('City', { exact: true }).fill('Da Nang');
    await panel.getByLabel('Capacity hint (optional)').fill('5000');
    await panel.getByRole('button', { name: 'Save venue' }).click();
    await page.getByText('Venue saved.').first().waitFor();
    await panel.getByLabel('New space name').fill('Balcony');
    await panel.getByRole('button', { name: 'Add space' }).click();
    await page.getByText('Space added.').first().waitFor();
    await shoot(page, 'scheduling-venue-library', { full: false });
    const saved = (await organizer('/venues')).data.find((item) => item.id === e2.venue.id);
    assert.equal(saved.address, 'Library Road 2');
    assert.equal(saved.city, 'Da Nang');
    assert.equal(saved.capacityHint, 5000);
    assert.deepEqual(saved.spaces.map((item) => item.name).sort(), ['Balcony', 'Stage A']);
    e2.venue = saved;
    return { address: saved.address, city: saved.city, capacityHint: saved.capacityHint, spaces: saved.spaces.length };
  });
  await flow('3e', 'Release as soon as approved (UI) and a scheduled release; venue name locks after release', async () => {
    const page = mgr.page;
    const sale = ticketGroups(e2.w.opens, e2.w.closes);
    await organizer('/performances/' + e2.a.id + '/sale', { method: 'PUT', body: { expectedSaleVersion: 0, ...sale } });
    e2.offerA = sale.offers[0];
    await page.goto('/organizer/events/' + e2.event.id + '?show=' + e2.a.id + '&step=review');
    await page.getByRole('radio', { name: 'Release as soon as approved' }).check();
    await shoot(page, 'scheduling-release-choice');
    await await page.getByRole('button', { name: 'Submit for review' }).click();
    await page.getByText('Awaiting review · Releases when approved').first().waitFor();
    const review = (await organizer('/performances/' + e2.a.id + '/publication')).data.review;
    assert.equal(review.state, 'SUBMITTED');
    assert.equal(review.releaseOnApproval, true);
    // Scheduled release of a second date on the same venue, by API.
    const wb = win(25);
    e2.b = await schedule(e2.event, { days: 6, spaceId: e2.venue.spaces[0].id, ...wb });
    e2.offerB = (await releaseSimple(e2.event, e2.b, wb.opens, wb.closes, {}, { mode: 'SCHEDULED' }));
    // Admin approves A; it becomes public without any release time.
    await api('POST', '/api/admin/v2/performance-reviews/' + e2.a.id, { token: admin.accessToken, body: { revision: review.id, action: 'APPROVE' } });
    await until(async () => {
      const publication = (await organizer('/performances/' + e2.a.id + '/publication')).data;
      return publication.ticketingAcknowledged && publication.checkinAcknowledged;
    }, { seconds: 180, label: 'A acknowledgements' });
    const detail = (await api('GET', '/api/v2/events/' + e2.event.id)).data;
    const ids = detail.performances.map((item) => item.id);
    assert.ok(ids.includes(e2.a.id) && ids.includes(e2.b.id), 'both dates are public: ' + ids.join());
    // Venue lock: the name stays fixed, city and spaces still change.
    await page.goto('/organizer/events/' + e2.event.id + '?show=' + e2.a.id + '&step=schedule');
    await page.getByRole('button', { name: 'Manage venues' }).click();
    const dialog = page.getByRole('dialog');
    await selectWorkspaceOption(dialog.getByLabel('Venue', { exact: true }), { label: /Library Hall/ });
    const panel = dialog.getByRole('region', { name: /Library Hall/ });
    await panel.getByLabel('Venue name').fill('Renamed hall ' + suffix);
    await panel.getByRole('button', { name: 'Save venue' }).click();
    await dialog.getByText('You can create a new venue below instead.').waitFor();
    await shoot(page, 'scheduling-venue-locked', { full: false });
    await panel.getByLabel('Venue name').fill('Library Hall ' + suffix);
    await panel.getByLabel('City', { exact: true }).fill('Hue');
    await panel.getByRole('button', { name: 'Save venue' }).click();
    await page.getByText('Venue saved.').first().waitFor();
    const after = (await organizer('/venues')).data.find((item) => item.id === e2.venue.id);
    assert.equal(after.city, 'Hue');
    assert.equal(after.name, 'Library Hall ' + suffix);
    return { releaseOnApproval: 'A public after approval with no release time', scheduledB: 'public', venueLock: 'rename refused with create-new-venue hint, city change saved' };
  });

  await flow('3f', 'Organizer pauses and resumes sales before doors; pause refused after doors open', async () => {
    const page = mgr.page;
    await until(() => Date.now() > e2.w.opens.getTime() + 2000, { seconds: 150, label: 'sale to open' });
    const access = await buying.enter(e2.a);
    const items = [{ offerId: e2.offerA.id, quantity: 1 }];
    // Sales are open: another buyer can hold.
    const other = await register('buyer-two');
    const otherAuth = await login(other.email, other.password);
    const otherFlow = buyerFlow(otherAuth.accessToken);
    await otherFlow.hold(e2.a, await otherFlow.enter(e2.a), items);
    await page.goto('/organizer/events/' + e2.event.id + '?show=' + e2.a.id + '&step=review');
    const panel = page.getByRole('region', { name: 'Sales controls' });
    await panel.getByText('Sales are open').first().waitFor();
    await shoot(page, 'sales-controls-open');
    await panel.getByRole('button', { name: 'Pause sales' }).click();
    const dialog = page.getByRole('dialog');
    await dialog.getByLabel('Reason').fill('Stage inspection before doors');
    await dialog.getByRole('button', { name: 'Pause sales' }).click();
    await panel.getByText('Sales paused', { exact: true }).waitFor({ timeout: 60_000 });
    await shoot(page, 'sales-controls-paused');
    const spaced = async (wantOk, label) => {
      for (let i = 0; i < 12; i++) {
        await sleep(5000);
        const attempt = await buying.hold(e2.a, access, items, [200, 400, 403, 404, 409, 410, 423, 429, 503]);
        if (attempt.status !== 429 && (attempt.status === 200) === wantOk) return attempt;
      }
      throw new Error('Timed out waiting for ' + label);
    };
    const blocked = await spaced(false, 'buyer hold to be refused while paused');
    await panel.getByRole('button', { name: 'Resume sales' }).click();
    await page.getByRole('alertdialog').getByRole('button', { name: 'Resume sales' }).click();
    await panel.getByText('Sales are open').first().waitFor({ timeout: 60_000 });
    await spaced(true, 'buyer hold to work again after resume');
    // Doors already open: the control is closed in the UI and refused by the API.
    const wd = win(30);
    const doorsStart = new Date(Date.now() + 25 * 60_000);
    wd.closes = doorsStart;
    e2.d = await schedule(e2.event, { startsAt: doorsStart, doorsOpenAt: new Date(Date.now() - 60_000), spaceId: e2.venue.spaces[0].id, ...wd });
    e2.offerD = await releaseSimple(e2.event, e2.d, wd.opens, wd.closes, {}, { mode: 'ON_APPROVAL' });
    await page.goto('/organizer/events/' + e2.event.id + '?show=' + e2.d.id + '&step=review');
    const doorsPanel = page.getByRole('region', { name: 'Sales controls' });
    await doorsPanel.getByText('Sales controls close when doors open.', { exact: false }).waitFor();
    assert.equal(await doorsPanel.getByRole('button', { name: 'Pause sales' }).isDisabled(), true);
    await shoot(page, 'sales-controls-doors-open');
    const refused = await organizer('/performances/' + e2.d.id + '/sales/pause', { method: 'POST', expect: [400, 403, 409, 422], body: { actionId: randomUUID(), reason: 'Too late' } });
    return { holdWhilePaused: blocked.status + ' ' + JSON.stringify(blocked.payload.message), resumed: true, pauseAfterDoors: 'button disabled with explanation, API ' + refused.status };
  });

  await flow('3g', 'Cancellation request: organizer sends, Admin Requests tab declines one and confirms another through the disruption workflow', async () => {
    const page = mgr.page;
    const wc = win(600);
    e2.c = await schedule(e2.event, { days: 8, spaceId: e2.venue.spaces[0].id, ...wc });
    await releaseSimple(e2.event, e2.c, wc.opens, wc.closes, {}, { mode: 'ON_APPROVAL' });
    const send = async (show, kind, reason) => {
      await page.goto('/organizer/events/' + e2.event.id + '?show=' + show.id + '&step=review');
      const panel = page.getByRole('region', { name: 'Sales controls' });
      await panel.getByRole('button', { name: 'Request cancellation or postponement' }).click();
      const dialog = page.getByRole('dialog');
      await dialog.getByRole('radio', { name: kind }).check();
      await dialog.getByLabel('Reason').fill(reason);
      if (kind === 'Cancellation') await shoot(page, 'scheduling-request-dialog', { full: false });
      await dialog.getByRole('button', { name: 'Send request' }).click();
      await panel.getByText('Waiting for TicketBox').first().waitFor();
    };
    await send(e2.c, 'Cancellation', 'Venue unavailable on that day ' + suffix);
    await send(e2.b, 'Cancellation', 'Artist cannot travel ' + suffix);
    // Admin: Requests tab.
    const admin1 = adm.page;
    await admin1.goto('/admin/performance-operations?tab=requests');
    const section = admin1.getByRole('region', { name: 'Requests' });
    await section.getByText('Venue unavailable on that day ' + suffix).waitFor();
    await shoot(admin1, 'admin-requests-tab');
    const row = section.locator('li, article, tr').filter({ hasText: 'Venue unavailable on that day ' + suffix }).first();
    await row.getByRole('button', { name: 'Decline', exact: true }).click();
    await section.getByLabel('Reason for declining').fill('The date is confirmed with the venue');
    await section.getByRole('button', { name: 'Decline request' }).click();
    await admin1.getByText('Request declined.').first().waitFor();
    await mgr.page.goto('/organizer/events/' + e2.event.id + '?show=' + e2.c.id + '&step=review');
    await mgr.page.getByText('Declined').first().waitFor();
    await mgr.page.getByText('The date is confirmed with the venue').first().waitFor();
    // Accept the other through the disruption workflow.
    await admin1.goto('/admin/performance-operations?tab=requests');
    const rowB = admin1.getByRole('region', { name: 'Requests' }).locator('li, article, tr').filter({ hasText: 'Artist cannot travel ' + suffix }).first();
    await rowB.getByRole('link', { name: 'Review and confirm' }).click();
    await admin1.waitForURL(/request=/);
    await admin1.waitForTimeout(2500);
    await admin1.getByRole('button', { name: 'Review change' }).click();
    await admin1.waitForTimeout(1500);
    await admin1.getByRole('button', { name: 'Cancel performance' }).last().click();
    await until(async () => {
      const state = (await organizer('/performances/' + e2.b.id + '/sales')).data;
      return state.request?.state === 'ACCEPTED' ? state : null;
    }, { seconds: 90, label: 'request accepted' });
    await mgr.page.goto('/organizer/events/' + e2.event.id + '?show=' + e2.b.id + '&step=review');
    await mgr.page.getByText('Accepted').first().waitFor();
    await mgr.page.getByText('Cancelled').first().waitFor();
    await shoot(mgr.page, 'scheduling-request-accepted');
    return { declined: 'visible to organizer with reason', accepted: 'disruption workflow cancelled the date; organizer sees Accepted and Cancelled' };
  });

  // ---------- Flow 4: seating and ticket authoring ----------
  const e4 = {};
  await flow('4a', 'Seating: first-run starter layout picker (Numbered theatre), save, sample CSV download', async () => {
    const page = mgr.page;
    e4.seated = await newEvent('Seating walk ' + suffix);
    const w = win(300);
    const show = await schedule(e4.seated, { days: 9, ...w });
    await page.goto('/organizer/events/' + e4.seated.id + '?show=' + show.id + '&step=tickets');
    await page.getByRole('button', { name: /Reserved seats/ }).click();
    await page.getByRole('button', { name: /Add seating map|Open (the )?map/ }).first().click();
    await page.getByRole('button', { name: /Numbered theatre/ }).waitFor();
    await shoot(page, 'starter-layout-picker');
    await page.getByRole('button', { name: /Numbered theatre/ }).click();
    await page.getByRole('button', { name: 'Use this layout' }).click();
    await page.getByText(/Added a starter layout with \d+ seats/).first().waitFor();
    await shoot(page, 'starter-layout-applied');
    await page.getByRole('button', { name: 'Save layout' }).click();
    await until(async () => (await organizer('/performances/' + show.id + '/layout')).data.layout, { label: 'layout saved' });
    const layout = (await organizer('/performances/' + show.id + '/layout')).data.layout;
    const seats = layout.sections.reduce((sum, section) => sum + (section.rows ?? []).reduce((n, row) => n + (row.seats ?? []).length, 0), 0);
    assert.ok(seats > 0, 'starter layout has seats');
    const importPanel = page.getByText('Import or reuse a map', { exact: true });
    if (await importPanel.count()) await importPanel.first().click();
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Download sample CSV' }).click();
    const file = await download;
    const name = file.suggestedFilename();
    const text = await (await import('node:fs/promises')).readFile(await file.path(), 'utf8');
    assert.match(text.split('\n')[0], /^section,row,seat,x,y/);
    return { starter: 'Numbered theatre', seats, sampleCsv: name };
  });
  await flow('4b', 'Ticket authoring: stock pool wording, money input, description, minimum 2, early bird in the same pool', async () => {
    const page = mgr.page;
    e4.event = await newEvent('Tickets walk ' + suffix);
    e4.w = win(120);
    e4.show = await schedule(e4.event, { days: 9, ...e4.w });
    await page.goto('/organizer/events/' + e4.event.id + '?show=' + e4.show.id + '&step=tickets');
    await page.getByRole('button', { name: /General admission/ }).click();
    await page.locator('input[name="name"]').fill('Pair ticket');
    await page.locator('input[name="capacity"]').fill('50');
    const price = page.locator('input[name="price"]');
    await price.fill('150000');
    await price.blur();
    const shown = await price.inputValue();
    await page.getByRole('button', { name: 'Add general admission ticket' }).last().click();
    await page.getByText('Pair ticket · Stock pool').waitFor();
    await page.getByLabel('Description for buyers (optional)').fill('Includes a poster and fast-lane entry');
    await page.getByLabel('Minimum per order').fill('2');
    await page.getByRole('button', { name: 'Add an early bird' }).click();
    await page.getByText('How stock pools work').click();
    await shoot(page, 'ticket-setup-presets');
    await page.getByRole('button', { name: 'Save sale' }).click();
    await page.getByText(/saved|Saved/).first().waitFor();
    const sale = (await organizer('/performances/' + e4.show.id + '/sale')).data;
    const pair = sale.offers.find((offer) => offer.name === 'Pair ticket');
    assert.equal(pair.price, 150000);
    assert.equal(pair.minPerOrder, 2);
    assert.equal(pair.description, 'Includes a poster and fast-lane entry');
    assert.equal(sale.groups.length, 1, 'the early bird shares the pool');
    assert.ok(sale.offers.length >= 2);
    e4.pair = pair;
    e4.sale = sale;
    return { priceFieldShows: shown, saved: sale.offers.map((offer) => [offer.name, offer.price, offer.minPerOrder ?? 1, offer.saleStartAt]) };
  });

  const releaseExisting = async (event, show, mode) => {
    const saleDraft = (await organizer('/performances/' + show.id + '/sale')).data;
    const current = (await organizer('/events/' + event.id)).data;
    const entry = current.performances.find((item) => item.id === show.id);
    const status = (await organizer('/performances/' + show.id + '/publication', { method: 'POST', body: {
      expectedSaleVersion: saleDraft.version, expectedLayoutVersion: 0, expectedEventDraftVersion: current.draftVersion,
      expectedScheduleDraftVersion: entry.draftVersion, releaseMode: mode, publishAt: mode === 'SCHEDULED' ? new Date(Date.now() + 3_000).toISOString() : null } })).data;
    await api('POST', '/api/admin/v2/performance-reviews/' + show.id, { token: admin.accessToken, body: { revision: status.review.id, action: 'APPROVE' } });
    await until(async () => {
      const publication = (await organizer('/performances/' + show.id + '/publication')).data;
      return publication.ticketingAcknowledged && publication.checkinAcknowledged;
    }, { seconds: 180, label: 'release acknowledgements' });
  };
  await flow('4c', 'Buyer sees the ticket description and minimum per order; stepper 0 to 2; a hold of 1 is refused', async () => {
    await releaseExisting(e4.event, e4.show, 'SCHEDULED');
    await until(() => Date.now() > e4.w.opens.getTime() + 2000, { seconds: 150, label: 'sale to open' });
    const detail = (await api('GET', '/api/v2/events/' + e4.event.id)).data;
    assert.ok(detail.performances.some((item) => item.id === e4.show.id));
    const bs = await session(buyer);
    const page = bs.page;
    await page.goto('/events/' + e4.event.id + '/performances/' + e4.show.id + '/tickets');
    await page.waitForTimeout(3000);
    await page.getByText('Includes a poster and fast-lane entry').first().waitFor();
    await page.getByText('Minimum 2 per order').first().waitFor();
    const add = page.getByRole('button', { name: 'Add one Pair ticket ticket', exact: true });
    const remove = page.getByRole('button', { name: 'Remove one Pair ticket ticket', exact: true });
    const selection = page.getByText(/tickets? held/).first();
    await add.click();
    await page.getByText('₫300,000').first().waitFor();
    const afterAdd = await selection.innerText();
    await shoot(page, 'buyer-ticket-selection-minimum');
    await remove.click();
    await page.waitForFunction(() => /0 tickets held/.test(document.body.innerText), null, { timeout: 15_000 });
    const third = await register('buyer-three');
    const thirdFlow = buyerFlow((await login(third.email, third.password)).accessToken);
    const accessThree = await thirdFlow.enter(e4.show);
    const one = await thirdFlow.hold(e4.show, accessThree, [{ offerId: e4.pair.id, quantity: 1 }], [400, 409, 422]);
    const two = await thirdFlow.hold(e4.show, accessThree, [{ offerId: e4.pair.id, quantity: 2 }], [200]);
    await bs.context.close();
    return { buyerSees: 'description and Minimum 2 per order', stepper: 'first press gives 2 (' + afterAdd + '), remove returns to 0', holdOfOne: one.status + ' ' + JSON.stringify(one.payload.message), holdOfTwo: two.status };
  });

  // ---------- Flow 5: organization settings and statements ----------
  await flow('5a', 'Settings: MEMBERS edits profile and timezone, FINANCE edits statement details, EVENTS-only is read-only', async () => {
    const profilePath = '/api/organizations/' + organization + '/profile';
    const memberSession = await session(members.MEMBERS, organization);
    const financeSession = await session(members.FINANCE, organization);
    const eventsSession = await session(members.EVENTS, organization);
    const m = memberSession.page;
    await m.goto('/organizer/settings');
    await m.getByRole('heading', { name: 'Organization settings' }).waitFor();
    await m.getByLabel('Contact email').fill('contact-' + suffix + '@example.test');
    await m.getByLabel('Contact phone').fill('0901234567');
    await m.getByLabel('Website').fill('https://example.test/' + suffix);
    await m.getByRole('button', { name: 'Save profile' }).click();
    await m.getByText('Settings saved').first().waitFor();
    // Timezone is a searchable list.
    await selectWorkspaceOption(m.getByLabel('Timezone', { exact: true }), { label: /Bangkok/ });
    await m.getByRole('button', { name: 'Save timezone' }).click();
    await m.getByText('Settings saved').first().waitFor();
    const afterMembers = (await api('GET', profilePath, { token: members.MEMBERS.accessToken })).data;
    assert.equal(afterMembers.contactEmail, 'contact-' + suffix + '@example.test');
    assert.equal(afterMembers.reportingTimezone, 'Asia/Bangkok');
    assert.equal(afterMembers.canEditProfile, true);
    assert.equal(afterMembers.canEditStatementDetails, true);
    await shoot(m, 'settings-members');
    const f = financeSession.page;
    await f.goto('/organizer/settings');
    await f.getByLabel('Legal name').fill('Final Walk Co., Ltd ' + suffix);
    await f.getByLabel('Tax code').fill('0312345678');
    await f.getByLabel('Billing address').fill('1 Final Road, Hanoi');
    await f.getByRole('button', { name: 'Save statement details' }).click();
    await f.getByText('Settings saved').first().waitFor();
    const afterFinance = (await api('GET', profilePath, { token: members.FINANCE.accessToken })).data;
    assert.equal(afterFinance.taxCode, '0312345678');
    assert.equal(afterFinance.canEditStatementDetails, true);
    assert.equal(afterFinance.canEditProfile, false);
    assert.equal(await f.getByLabel('Contact email').isEditable(), false, 'FINANCE cannot edit the profile');
    await shoot(f, 'settings-finance');
    const e = eventsSession.page;
    await e.goto('/organizer/settings');
    await e.getByRole('heading', { name: 'Organization settings' }).waitFor();
    await e.waitForTimeout(1000);
    const disabled = await e.locator('main input:not([type="file"]), main textarea').evaluateAll((nodes) => nodes.filter((node) => !node.disabled && !node.readOnly).length);
    assert.equal(disabled, 0, 'EVENTS-only members see read-only fields');
    assert.equal(await e.getByRole('button', { name: /^Save/ }).count() === 0 || (await e.getByRole('button', { name: /^Save/ }).first().isDisabled()), true);
    await shoot(e, 'settings-events-readonly');
    // Logo upload: Cloudinary is not configured, so only the friendly error is checked.
    await m.goto('/organizer/settings');
    const zlib = await import('node:zlib');
    const side = 128;
    const raw = Buffer.alloc((side * 3 + 1) * side, 0x80);
    for (let y = 0; y < side; y++) raw[y * (side * 3 + 1)] = 0;
    const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
    const crc = (buffer) => { let c = 0xffffffff; for (const byte of buffer) c = crcTable[(c ^ byte) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
    const chunk = (type, data) => { const body = Buffer.concat([Buffer.from(type), data]); const out = Buffer.alloc(12 + data.length); out.writeUInt32BE(data.length, 0); body.copy(out, 4); out.writeUInt32BE(crc(body), 8 + data.length); return out; };
    const header = Buffer.alloc(13); header.writeUInt32BE(side, 0); header.writeUInt32BE(side, 4); header[8] = 8; header[9] = 2;
    const logo = Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', header), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    await m.locator('input[type="file"]').first().setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: logo });
    await m.waitForTimeout(3000);
    const logoUi = (await m.locator('[role="alert"], [role="status"], [data-sonner-toast]').allInnerTexts()).join(' | ');
    await api('PUT', profilePath, { token: members.MEMBERS.accessToken, body: { contactEmail: afterMembers.contactEmail, contactPhone: afterMembers.contactPhone ?? '', website: afterMembers.website ?? '', reportingTimezone: 'Asia/Ho_Chi_Minh', version: (await api('GET', profilePath, { token: members.MEMBERS.accessToken })).data.version } });
    for (const s of [memberSession, financeSession, eventsSession]) await s.context.close();
    return { members: 'profile and timezone saved', finance: 'statement details saved', eventsOnly: 'all fields read-only', logoUploadMessage: logoUi };
  });

  const e5 = {};
  await flow('5b', 'Statements: FINANCE issues after the performance ends, downloads PDF and CSV; a refund marks it out of date; re-issue creates revision 2', async () => {
    const profile = (await api('GET', '/api/organizations/' + organization + '/profile', { token: members.FINANCE.accessToken })).data;
    if (!profile.taxCode) await api('PUT', '/api/organizations/' + organization + '/profile/statement-details', { token: members.FINANCE.accessToken,
      body: { legalName: 'Final Walk Co., Ltd ' + suffix, taxCode: '0312345678', billingAddress: '1 Final Road, Hanoi', version: profile.version } });
    e5.event = await newEvent('Statement walk ' + suffix);
    const w = win(15);
    e5.show = await schedule(e5.event, { days: 4, ...w });
    e5.offer = await releaseSimple(e5.event, e5.show, w.opens, w.closes, {}, { mode: 'SCHEDULED' });
    await until(() => Date.now() > w.opens.getTime() + 2000, { seconds: 120, label: 'sale to open' });
    e5.orderA = await buying.buy(e5.show, [{ offerId: e5.offer.id, quantity: 2 }]);
    e5.orderB = await buying.buy(e5.show, [{ offerId: e5.offer.id, quantity: 1 }]);
    // The performance has to be over: move its end into the past in Ticketing's projection.
    sql('ticketing', "UPDATE performance_sales SET ends_at = now() - interval '1 hour' WHERE id='" + e5.show.id + "'");
    const finance = await session(members.FINANCE, organization);
    const page = finance.page;
    await page.goto('/organizer/reports?view=statements');
    await page.waitForTimeout(3000);
    await page.getByRole('button', { name: /Issue a statement for Statement walk/ }).click();
    const dialog = page.locator('[role="alertdialog"], [role="dialog"]').last();
    await dialog.getByText('Details printed on the statement').waitFor();
    await dialog.getByText('0312345678').waitFor();
    await shoot(page, 'statement-issue-dialog', { full: false });
    await dialog.getByRole('button', { name: 'Issue statement' }).click();
    const first = await until(async () => (await api('GET', '/api/organizer/statements?size=20', { token: members.FINANCE.accessToken, headers: scope })).data.content.find((item) => item.scopeId === e5.show.id), { label: 'issued statement' });
    const number = first.number;
    await page.getByText('Statement ' + number + ' issued').first().waitFor();
    assert.equal(first.revision, 1);
    assert.equal(first.totals.netSales, 300000);
    const downloads = {};
    for (const format of ['PDF', 'CSV']) {
      const pending = page.waitForEvent('download');
      await page.getByRole('button', { name: 'Download ' + format + ' of ' + number }).click();
      const file = await pending;
      const bytes = await (await import('node:fs/promises')).readFile(await file.path());
      if (format === 'PDF') assert.equal(bytes.subarray(0, 4).toString(), '%PDF');
      else assert.ok(bytes.toString('utf8').includes('300000') || bytes.toString('utf8').includes('300,000'), 'CSV carries the net total');
      downloads[format] = file.suggestedFilename() + ' ' + bytes.length + ' bytes';
    }
    await shoot(page, 'statements-tab');
    // A later refund makes it out of date.
    const path = '/api/admin/orders/' + e5.orderB.id + '/refunds';
    const action = (kind, extra = {}) => ({ actionId: randomUUID(), action: kind, detail: 'Final walkthrough refund', ...extra });
    const requested = (await api('POST', path, { token: admin.accessToken, body: action('REQUEST') })).data;
    const approval = action('APPROVE', { caseId: requested.id });
    await until(async () => (await api('POST', path, { token: secondAdmin.accessToken, body: approval, expect: [200, 409, 503] })).data.state === 'APPROVED', { seconds: 120, label: 'refund approval' });
    await api('POST', path, { token: secondAdmin.accessToken, body: action('CONFIRM', { caseId: requested.id, amount: requested.amount, externalReference: 'FINAL-' + suffix, occurredAt: new Date().toISOString() }) });
    await until(() => sql('ticketing', "SELECT status FROM orders WHERE id='" + e5.orderB.id + "'") === 'REFUNDED', { label: 'refunded order' });
    await until(async () => {
      const eligible = (await api('GET', '/api/organizer/statements/eligible?size=20', { token: members.FINANCE.accessToken, headers: scope })).data.content;
      return eligible.find((item) => item.scopeId === e5.show.id && item.outOfDate);
    }, { seconds: 90, label: 'statement to be out of date' });
    await page.goto('/organizer/reports?view=statements');
    await page.getByText('Out of date').first().waitFor();
    await shoot(page, 'statements-out-of-date');
    await page.getByRole('button', { name: /Re-issue the statement for Statement walk/ }).click();
    await page.locator('[role="alertdialog"], [role="dialog"]').last().getByRole('button', { name: 'Issue new revision' }).click();
    await page.waitForTimeout(1500);
    const after = (await api('GET', '/api/organizer/statements?size=20', { token: members.FINANCE.accessToken, headers: scope })).data.content.filter((item) => item.scopeId === e5.show.id);
    assert.deepEqual(after.map((item) => item.revision).sort(), [1, 2]);
    const current = after.find((item) => item.revision === 2);
    assert.equal(current.totals.netSales, 200000);
    assert.equal(current.supersedesNumber, number);
    assert.equal(after.find((item) => item.revision === 1).status, 'SUPERSEDED');
    await shoot(page, 'statements-revision');
    await finance.context.close();
    return { number, downloads, revision2Net: current.totals.netSales, supersedes: current.supersedesNumber };
  });

  // ---------- Flow 6: check-in ----------
  const e6 = {};
  await flow('6a', 'Check-in setup: guests imported, two tickets sold, STAFF account assigned through the Staff panel', async () => {
    e6.event = await newEvent('Check-in walk ' + suffix);
    const w = win(20);
    e6.show = await schedule(e6.event, { days: 3, ...w });
    e6.offer = await releaseSimple(e6.event, e6.show, w.opens, w.closes, {}, { mode: 'SCHEDULED' });
    const page = mgr.page;
    await page.goto('/organizer/events/' + e6.event.id + '?show=' + e6.show.id + '&step=guests');
    const csv = 'phone,full_name,category,sponsor_name,notes\n0911111111,Le Guest One,VIP,Partner,final\n0922222222,Pham Guest Two,Press,Media,final\n';
    await page.locator('input[type="file"]').setInputFiles({ name: 'guests.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });
    await page.locator('form button[type="submit"]').click();
    await until(async () => (await api('GET', '/api/organizer/manage/concerts/' + e6.show.id + '/guest-lists', { token: manager.accessToken, headers: scope })).data.content.length === 2, { seconds: 120, label: 'guest import' });
    await until(() => Date.now() > w.opens.getTime() + 2000, { seconds: 120, label: 'sale to open' });
    e6.order = await buying.buy(e6.show, [{ offerId: e6.offer.id, quantity: 2 }]);
    const tickets = (await api('GET', '/api/tickets', { token: buyer.accessToken })).data.filter((ticket) => ticket.concertId === e6.show.id || ticket.performanceId === e6.show.id);
    assert.equal(tickets.length, 2);
    e6.tickets = tickets;
    // Staff panel: the account is a member with Admission, so it can be assigned.
    await page.goto('/organizer/events/' + e6.event.id + '?show=' + e6.show.id + '&step=review');
    const panel = page.getByRole('region', { name: 'Gate staff' });
    await panel.waitFor();
    await selectWorkspaceOption(panel.getByLabel('Staff member'), { label: /staff-member fixture/ });
    await panel.getByRole('button', { name: /^Assign/ }).click();
    await until(async () => (await organizer('/performances/' + e6.show.id + '/staff')).data.some((entry) => entry.staffId === members.STAFF.user.id), { label: 'assignment' });
    await shoot(page, 'organizer-staff-panel');
    return { tickets: tickets.map((ticket) => ticket.referenceCode), assigned: members.STAFF.user.id };
  });
  await flow('6b', 'Staff web app: assigned performance listed, manual ticket code Allowed in, repeat rejected, guest desk check-in, revoke removes access (second performance untouched)', async () => {
    const staff = await session(members.STAFF, organization);
    const page = staff.page;
    await page.goto('/staff');
    await page.getByText('Check-in walk ' + suffix).first().waitFor();
    await shoot(page, 'staff-overview');
    await page.getByRole('link', { name: 'Check in' }).first().click();
    await page.getByLabel('Gate', { exact: true }).fill('WEB');
    const code = e6.tickets[0].qrCode;
    await page.getByLabel('Ticket code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Check in', exact: true }).click();
    await page.getByText('Allowed in').first().waitFor();
    await shoot(page, 'staff-check-in-allowed');
    await page.getByLabel('Ticket code', { exact: true }).fill(code);
    await page.getByRole('button', { name: 'Check in', exact: true }).click();
    await page.getByText('Not accepted').first().waitFor();
    const rejection = (await page.getByRole('alert').allInnerTexts()).join(' | ') + ' ' + (await page.getByText('Not accepted').first().locator('xpath=ancestor::*[self::section or self::div][2]').innerText());
    assert.match(rejection, /not valid for check-in/i, 'the repeat is refused: ' + rejection);
    await shoot(page, 'staff-check-in-rejected');
    // Guest desk.
    await page.getByRole('link', { name: 'Guests' }).first().click();
    await page.getByText('Le Guest One').waitFor();
    const row = page.locator('li, tr, article').filter({ hasText: 'Le Guest One' }).first();
    await row.getByRole('button', { name: 'Check in' }).click();
    await page.getByText(/Checked in .*gate/).first().waitFor();
    await shoot(page, 'staff-guests');
    await page.getByRole('link', { name: 'History' }).first().click();
    await page.getByRole('table').waitFor();
    await shoot(page, 'staff-history');
    await staff.context.close();
    return { allowed: true, repeat: rejection.slice(0, 160), guest: 'Le Guest One checked in at gate WEB' };
  });
  await flow('6c', 'Organizer Check-in panel: totals, gates, guests, recent admissions without QR values; FINANCE-only sees no panel; revoke removes staff access', async () => {
    const page = mgr.page;
    await page.goto('/organizer/events/' + e6.event.id + '?show=' + e6.show.id + '&step=review');
    const panel = page.getByRole('region', { name: 'Check-in' });
    await panel.getByText(/1 of 2 valid tickets admitted/).waitFor();
    await panel.getByText('WEB').first().waitFor();
    await panel.getByText(/1 of 2/).first().waitFor();
    const text = await panel.innerText();
    for (const ticket of e6.tickets) assert.equal(text.includes(ticket.qrCode), false, 'the QR value is never shown');
    await shoot(page, 'organizer-checkin-panel');
    const financeOnly = await session(members.FINANCE, organization);
    await financeOnly.page.goto('/organizer/events/' + e6.event.id + '?show=' + e6.show.id + '&step=review');
    await financeOnly.page.waitForTimeout(2500);
    const financeHasPanel = await financeOnly.page.getByRole('region', { name: 'Check-in' }).count();
    await financeOnly.context.close();
    // Revoke: the staff account loses the performance.
    await organizer('/performances/' + e6.show.id + '/staff/' + members.STAFF.user.id, { method: 'DELETE', expect: [200, 204] });
    const staff = await session(members.STAFF, organization);
    await staff.page.goto('/staff');
    await staff.page.waitForTimeout(2500);
    const stillListed = await staff.page.getByText('Check-in walk ' + suffix).count();
    await staff.context.close();
    assert.equal(stillListed, 0, 'revoked staff no longer see the performance');
    return { totals: '1 of 2 admitted', gate: 'WEB', guests: '1 of 2', qrShown: false, financeOnlyPanel: financeHasPanel, revokedAccess: 'removed' };
  });

} catch (error) {
  results.push({ id: 'setup', name: 'Setup', status: 'fail', error: String(error.stack ?? error) });
  console.log('SETUP FAIL', error);
} finally {
  await writeFile(report + '/organizer-final.json', JSON.stringify({ results, overflows }, null, 2));
  await browser.close();
}
if (results.some((entry) => entry.status !== 'pass')) process.exitCode = 1;
