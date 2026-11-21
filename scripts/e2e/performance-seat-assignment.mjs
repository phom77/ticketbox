import { selectWorkspaceOption } from './select-workspace-option.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18105';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use an isolated loopback deployment');

const portableSeating = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 460">
  <g id="stage">
    <polygon points="247,94 513,94 545,142 215,142"/>
    <text>SÂN KHẤU</text>
  </g>
  <g id="section-BAL" data-code="BAL" data-kind="ASSIGNED">
    <title>BAL · Balcony</title>
    <polygon id="outline-BAL" points="160,170 600,170 600,300 160,300"/>
    <g id="row-BAL-A" data-row="A">
      <g id="seat-BAL-A-1" data-seat="1"><circle cx="300" cy="225" r="8"/></g>
      <g id="seat-BAL-A-2" data-seat="2" data-accessible="true"><circle cx="460" cy="225" r="8"/></g>
    </g>
  </g>
</svg>`;

const portableZones = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 760 460">
  <g id="stage"><polygon points="247,94 513,94 545,142 215,142"/><text>SÂN KHẤU</text></g>
  <g id="section-FL" data-code="FL" data-kind="GA" data-capacity="250">
    <title>FL · Floor left</title>
    <polygon id="outline-FL" points="40,176 345,176 345,367 40,367"/>
  </g>
  <g id="section-FR" data-code="FR" data-kind="GA" data-capacity="250">
    <title>FR · Floor right</title>
    <polygon id="outline-FR" points="410,176 720,176 720,367 410,367"/>
  </g>
</svg>`;

const organizerApi = '/api/organizer/manage/v2';
const browser = await chromium.launch();
const organizerContext = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 1440, height: 900 } });
const buyerContext = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 390, height: 844 } });
const suffix = randomUUID().slice(0, 8);
const after = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();

async function api(context, path, options = {}) {
  const response = await context.request.fetch(path, options);
  assert.ok(response.ok(), `${options.method ?? 'GET'} ${path} returned ${response.status()}: ${await response.text()}`);
  return (await response.json()).data;
}

function login(context, role) {
  return api(context, '/api/auth/login', {
    method: 'POST', data: { email: role + '@ticketbox.com', password: 'password123' },
  });
}

async function session(context, loginResult) {
  await context.addCookies([{ name: 'ticketbox_auth_token', value: loginResult.accessToken, url: baseURL }]);
}

const drafts = (performanceId) => organizerApi + '/performances/' + performanceId;

async function getLocalFixture(variant) {
  const path = new URL('../../.artifacts/test-maps/test-map-' + variant + '.svg', import.meta.url);
  try {
    return await readFile(path);
  } catch (error) {
    if (error.code === 'ENOENT') return null;
    throw error;
  }
}

try {
  const admin = await login(organizerContext, 'admin');
  const organizer = await login(organizerContext, 'organizer');
  const org = await api(organizerContext, '/api/admin/organizations', {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + admin.accessToken },
    data: { name: 'Map import rehearsal ' + suffix, initialManagerId: organizer.user.id },
  });
  const auth = { Authorization: 'Bearer ' + organizer.accessToken, 'X-Organization-Id': org.id };
  const create = (path, data) => api(organizerContext, organizerApi + path, { method: 'POST', headers: auth, data });

  const event = await create('/events', { title: 'Map and pricing rehearsal ' + suffix });
  async function addPerformance(name) {
    const venue = await create('/venues', { name, address: 'Fixture Street', spaceName: 'Main hall' });
    return create('/events/' + event.id + '/performances', {
      venueSpaceId: venue.spaces[0].id, startsAt: after(48), endsAt: after(52), doorsOpenAt: after(47),
      saleStartAt: after(-2), saleEndAt: after(24), timezone: 'Asia/Ho_Chi_Minh',
      maxPerAccount: 5, publicVisible: true,
    });
  }

  const numbered = await addPerformance('Numbered hall');
  const zoned = await addPerformance('General-admission hall');
  const suppliedSeating = await getLocalFixture('seats');
  const suppliedZones = await getLocalFixture('zones');
  const suppliedNumbered = suppliedSeating ? await addPerformance('Supplied seat map hall') : null;
  const suppliedZoned = suppliedZones ? await addPerformance('Supplied zone map hall') : null;
  await session(organizerContext, organizer);
  const page = await organizerContext.newPage();
  page.setDefaultTimeout(15_000);
  await page.addInitScript(({ user, organization }) => {
    sessionStorage.setItem('ticketbox.organization.' + user, organization);
  }, { user: organizer.user.id, organization: org.id });
  await page.goto('/organizer/events/' + event.id);

  async function importMap(performance, source, filename, model) {
    const backToTickets = page.getByRole('button', { name: 'Back to ticket setup' });
    if (await backToTickets.isVisible()) await backToTickets.click();
    await selectWorkspaceOption(page.getByLabel('Current performance'), { value: performance.id });
    await page.getByRole('button', { name: model, exact: true }).click();
    await page.getByRole('button', { name: 'Add seating map' }).click();
    const editor = page.getByRole('region', { name: 'Venue layout' });
    await editor.getByText('Import or reuse a map', { exact: true }).click();
    await editor.getByLabel('Import interactive SVG').setInputFiles({
      name: filename, mimeType: 'image/svg+xml', buffer: Buffer.from(source),
    });
    await editor.getByRole('status').filter({ hasText: /^Imported / }).waitFor();
    const next = page.getByRole('button', { name: 'Continue to tickets' });
    assert.ok(!(await next.count()) || await next.isDisabled());
    const saved = editor.getByRole('status').filter({ hasText: 'Saved.' });
    await editor.getByRole('button', { name: 'Save layout' }).click();
    await saved.waitFor();
    return api(organizerContext, drafts(performance.id) + '/layout', { headers: auth });
  }

  const ga = await importMap(zoned, portableZones, 'zones.svg', 'Admission by zone');
  assert.deepEqual(ga.layout.sections.map(({ code, kind, rows }) => [code, kind, rows.length]), [
    ['FL', 'GA', 0], ['FR', 'GA', 0],
  ]);
  if (suppliedNumbered) {
    const original = await importMap(suppliedNumbered, suppliedSeating, 'test-map-seats.svg', 'Reserved seats');
    assert.equal(original.layout.sections.length, 3);
    assert.equal(original.layout.sections.flatMap(section => section.rows.flatMap(row => row.seats)).length, 120);
  }
  if (suppliedZoned) {
    const original = await importMap(suppliedZoned, suppliedZones, 'test-map-zones.svg', 'Admission by zone');
    assert.equal(original.layout.sections.length, 5);
    assert.ok(original.layout.sections.every(section => section.kind === 'GA' && !section.rows.length));
  }

  const assigned = await importMap(numbered, portableSeating, 'seats.svg', 'Reserved seats');
  assert.equal(assigned.layout.sections[0].kind, 'ASSIGNED');
  const [seat1, seat2] = assigned.layout.sections[0].rows[0].seats;
  assert.equal(seat1.label, '1');
  assert.equal(seat2.label, '2');
  assert.ok(seat2.accessible);

  await page.getByRole('button', { name: 'Continue to tickets' }).click();
  const sale = page.getByRole('region', { name: 'Sale configuration' });
  const assignment = sale.getByRole('region', { name: 'Seat assignment' });
  await selectWorkspaceOption(assignment.getByLabel('Seating section'), { value: assigned.layout.sections[0].id });
  async function addTicketType(name, price) {
    await assignment.getByLabel('Ticket type name').fill(name);
    await assignment.getByLabel('Price in VND').fill(String(price));
    await assignment.getByRole('button', { name: 'Add seated ticket type' }).click();
    await selectWorkspaceOption(assignment.getByLabel('Assign seats to'), { label: new RegExp('^' + name + ' ·') });
  }
  await addTicketType('Standard', 125000);
  await assignment.getByRole('button', { name: 'Assign remaining seats in section' }).click();
  await addTicketType('Premium', 280000);
  await assignment.locator('svg [data-seat-id="' + seat1.id + '"]').click();
  const reportDirectory = process.env.E2E_REPORT_DIRECTORY;
  if (reportDirectory) await mkdir(reportDirectory, { recursive: true });
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `Seat assignment overflows at ${width}px`);
    if (reportDirectory) await assignment.screenshot({ path: `${reportDirectory}/seat-assignment-${width}.png` });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  const savingSale = page.waitForResponse(response =>
    new URL(response.url()).pathname === drafts(numbered.id) + '/sale' && response.request().method() === 'PUT');
  await sale.getByRole('button', { name: 'Save sale' }).click();
  const savedResponse = await savingSale;
  assert.ok(savedResponse.ok(), await savedResponse.text());

  const saved = await api(organizerContext, drafts(numbered.id) + '/sale', { headers: auth });
  const premium = saved.offers.find(offer => offer.name === 'Premium');
  const normal = saved.offers.find(offer => offer.name === 'Standard');
  assert.equal(premium.price, 280000);
  assert.equal(normal.price, 125000);
  assert.deepEqual(saved.groups.find(group => group.id === premium.groupId).seats.map(item => item.id), [seat1.id]);
  assert.deepEqual(saved.groups.find(group => group.id === normal.groupId).seats.map(item => item.id), [seat2.id]);
  assert.ok(saved.groups.every(group => group.capacity === 1));

  await page.reload();
  await selectWorkspaceOption(page.getByLabel('Current performance'), { value: numbered.id });
  await sale.getByRole('button', { name: 'Save and review' }).click();
  await page.getByRole('region', { name: 'Review performance' }).getByRole('button', { name: 'Publish performance' }).click();
  await page.getByRole('region', { name: 'Publication status' }).getByText('Synchronized', { exact: true }).nth(1)
    .waitFor({ timeout: 30_000 });
  const published = await api(organizerContext, drafts(numbered.id) + '/sale', { headers: auth });
  assert.deepEqual(published.groups.find(group => group.id === premium.groupId).seats.map(item => item.id), [seat1.id]);
  assert.deepEqual(published.groups.find(group => group.id === normal.groupId).seats.map(item => item.id), [seat2.id]);

  const buyer = await login(buyerContext, 'audience');
  await session(buyerContext, buyer);
  const purchase = await buyerContext.newPage();
  purchase.setDefaultTimeout(25_000);
  const publicPath = '/api/v2/performances/' + numbered.id;
  await purchase.goto('/events/' + event.id);
  await purchase.getByRole('link', { name: 'Buy tickets' }).click();
  await purchase.getByRole('heading', { name: 'Choose tickets' }).waitFor();
  await purchase.locator('svg.performance-map').first().locator('polygon.performance-map-area').click();
  const premiumCircle = purchase.locator('svg circle[data-seat-id="' + seat1.id + '"]');
  await premiumCircle.waitFor();
  const expectedHold = (seatId) => purchase.waitForResponse(response =>
    new URL(response.url()).pathname === publicPath + '/hold'
      && response.request().method() === 'PUT'
      && response.request().postDataJSON().items.some(item => item.seatId === seatId));
  const firstHold = expectedHold(seat1.id);
  await premiumCircle.click();
  const first = await firstHold;
  assert.equal(first.status(), 200, await first.text());
  assert.deepEqual((await first.json()).data.items.map(({ seatId, offerId, unitPrice }) => [seatId, offerId, unitPrice]),
    [[seat1.id, premium.id, 280000]]);
  await purchase.getByRole('complementary', { name: 'Your selection' }).getByText('Premium', { exact: true }).waitFor();

  const secondHold = expectedHold(seat2.id);
  const keyboardSeat = purchase.getByRole('button', { name: /Row A, seat 2/ });
  await keyboardSeat.focus();
  await purchase.keyboard.press('Enter');
  const second = await secondHold;
  assert.equal(second.status(), 200, await second.text());
  const result = (await second.json()).data;
  assert.deepEqual(new Map(result.items.map(({ seatId, offerId, unitPrice }) => [seatId, [offerId, unitPrice]])),
    new Map([[seat1.id, [premium.id, 280000]], [seat2.id, [normal.id, 125000]]]));
  assert.equal(result.totalAmount, 405000);
  console.log('SVG import, individual seat pricing, and correct public holds passed.');
} finally {
  await browser.close();
}
