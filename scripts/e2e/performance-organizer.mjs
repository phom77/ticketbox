import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18105';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use an isolated loopback deployment');
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, locale: 'en-US', reducedMotion: 'reduce', timezoneId: 'America/Los_Angeles', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const suffix = randomUUID().slice(0, 8);
const organizationName = 'Layout rehearsal ' + suffix;
const title = 'Arena sessions ' + suffix;
const localTime = (hours) => new Date(Date.now() + (hours + 7) * 3_600_000).toISOString().slice(0, 16);
const organizerApi = '/api/organizer/manage/v2';
const screenshotDirectory = process.env.E2E_REPORT_DIRECTORY;
const progress = page.getByRole('navigation', { name: 'Concert preparation steps' });

async function inspectViewport(stage) {
  for (const width of [1440, 834, 390]) {
    await page.setViewportSize({ width, height: 900 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `${stage} overflows at ${width}px`);
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/${stage}-${width}.png`, fullPage: true, animations: 'disabled' });
  }
  await page.setViewportSize({ width: 1440, height: 900 });
}

async function fillSchedule(start, end, { doors = '', saleOpen = localTime(-2), saleClose = localTime(24) } = {}) {
  await page.locator('input[name="startsAt"]').fill(start);
  await page.locator('input[name="endsAt"]').fill(end);
  await page.locator('input[name="doorsOpenAt"]').fill(doors);
  await page.locator('input[name="saleStartAt"]').fill(saleOpen);
  await page.locator('input[name="saleEndAt"]').fill(saleClose);
}


async function login(role) {
  const response = await context.request.post('/api/auth/login', {
    data: { email: role + '@ticketbox.com', password: 'password123' },
  });
  assert.equal(response.status(), 200);
  return (await response.json()).data;
}

async function draw(mode, label, code, points) {
  await page.getByLabel('What to draw').selectOption(mode);
  await page.locator('input[name="label"]').fill(label);
  await page.locator('input[name="code"]').fill(code);
  for (const [x, y] of points) {
    await page.getByLabel('X coordinate').fill(String(x));
    await page.getByLabel('Y coordinate').fill(String(y));
    await page.getByRole('button', { name: 'Add point by coordinates' }).click();
  }
  await page.getByRole('button', { name: 'Add to layout' }).click();
}

try {
  const admin = await login('admin');
  const organizer = await login('organizer');
  const created = await context.request.post('/api/admin/organizations', {
    headers: { Authorization: 'Bearer ' + admin.accessToken },
    data: { name: organizationName, initialManagerId: organizer.user.id },
  });
  assert.equal(created.status(), 201);
  const organization = (await created.json()).data.id;
  await context.addCookies([{ name: 'ticketbox_auth_token', value: organizer.accessToken, url: baseURL }]);
  await page.addInitScript(({ user, organization }) => {
    sessionStorage.setItem('ticketbox.organization.' + user, organization);
  }, { user: organizer.user.id, organization });

  await page.goto('/organizer/events');
  await page.getByRole('link', { name: 'Create concert' }).click();
  if (screenshotDirectory) await mkdir(screenshotDirectory, { recursive: true });
  await page.getByLabel('Title', { exact: true }).fill(title);
  await inspectViewport('concert-information');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('heading', { name: title }).waitFor();
  await page.reload();
  await page.getByRole('button', { name: 'Add venue', exact: true }).click();
  await page.getByLabel('Venue name').fill('Landmark Arena');
  await page.getByLabel('Address', { exact: true }).fill('Arena Lane');
  await page.getByLabel('Space name').fill('Main hall');
  await page.getByRole('button', { name: 'Save venue' }).click();
  await page.getByLabel('Venue / space').getByRole('option', { name: /Landmark Arena/ }).waitFor({ state: 'attached' });

  const startsAt = page.locator('input[name="startsAt"]');
  assert.equal(await startsAt.getAttribute('type'), 'datetime-local');
  const showStart = localTime(48);
  const showEnd = localTime(52);
  await fillSchedule(showStart, localTime(46), { doors: localTime(47) });
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByText('End time must be after the start time.', { exact: true }).waitFor();
  assert.equal(await page.locator('input[name="endsAt"]').getAttribute('aria-invalid'), 'true');
  await page.locator('input[name="endsAt"]').fill(showEnd);
  await inspectViewport('schedule');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('heading', { name: 'Tickets and map', exact: true }).waitFor();

  const event = new URL(page.url()).pathname.split('/').at(-1);
  const auth = { Authorization: 'Bearer ' + organizer.accessToken, 'X-Organization-Id': organization };
  async function readEvent() {
    const response = await context.request.get(organizerApi + '/events/' + event, { headers: auth });
    assert.equal(response.status(), 200, await response.text());
    return (await response.json()).data;
  }

  await page.getByRole('link', { name: 'Your events' }).click();
  await page.getByRole('link', { name: new RegExp(title) }).click();
  await progress.getByRole('button', { name: 'Event information' }).click();
  assert.equal(await page.getByLabel('Title', { exact: true }).inputValue(), title);
  await page.getByLabel('Description (optional)').fill('Two shows with different seating options.');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  assert.equal(await page.locator('input[name="endsAt"]').inputValue(), showEnd);
  const savedPerformance = (await readEvent()).performances[0];
  const concurrentEdit = await context.request.put(organizerApi + '/performances/' + savedPerformance.id + '/schedule', {
    headers: auth,
    data: { ...savedPerformance, expectedDraftVersion: savedPerformance.draftVersion, maxPerAccount: 5 },
  });
  assert.equal(concurrentEdit.status(), 200, await concurrentEdit.text());
  await page.getByLabel('Ticket limit per account').fill('6');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByRole('button', { name: 'Reload saved draft' }).click();
  assert.equal(await page.getByLabel('Ticket limit per account').inputValue(), '5');
  await page.getByLabel('Ticket limit per account').fill('6');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('button', { name: 'Add seating map' }).click();
  await page.getByRole('button', { name: 'Edit layout' }).click();
  await draw('GA', 'Floor', 'FL', [[25, 50], [250, 50], [250, 300], [25, 300]]);
  await draw('ASSIGNED', 'Balcony', 'BAL', [[300, 50], [650, 50], [650, 300], [300, 300]]);
  await draw('STAGE', 'Stage', '', [[250, 5], [550, 5], [550, 35], [250, 35]]);
  const csv = page.getByLabel('Import seats from CSV');
  await csv.setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from('section,row,seat,x,y\nBAL,A,1,,90') });
  await page.getByRole('alert').filter({ hasText: 'line 2' }).waitFor();
  await csv.setInputFiles({ name: 'balcony.csv', mimeType: 'text/csv', buffer: Buffer.from('section,row,seat,x,y\nBAL,A,1,350,90\nBAL,A,2,365,90') });
  await page.getByRole('status').filter({ hasText: 'Imported 2 seats' }).waitFor();
  await page.getByRole('button', { name: 'Save layout' }).click();
  await page.locator('section[aria-label="Venue layout"]').getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
  await page.getByRole('button', { name: 'Preview layout' }).click();
  assert.equal(await page.locator('.editor-map polygon').count(), 3);

  const sale = page.getByRole('region', { name: 'Sale configuration' });
  await sale.getByText('Inventory and pricing', { exact: true }).click();
  await sale.getByRole('button', { name: 'Add inventory group' }).click();
  await sale.getByRole('group', { name: 'Floor' }).getByLabel('Capacity').fill('120');
  await sale.getByRole('button', { name: 'Add offer' }).click();
  const standing = sale.getByRole('group', { name: 'Sale offer' });
  await standing.getByLabel('Price in VND').fill('150000');
  await standing.getByLabel('Name', { exact: true }).fill('Standing');
  const standingTicket = sale.getByRole('group', { name: 'Standing' });
  await standingTicket.getByText('Ticket sale window', { exact: true }).click();
  const offerOpens = standingTicket.getByLabel('Sale opens at');
  assert.equal(await offerOpens.getAttribute('type'), 'datetime-local');
  await offerOpens.fill(localTime(-12));
  await sale.getByRole('button', { name: 'Save sale' }).click();
  await standingTicket.getByText(/Each ticket sale window must fit/).first().waitFor();
  await standingTicket.getByRole('button', { name: 'Use performance sale window' }).click();
  await offerOpens.waitFor({ state: 'visible' });

  const assignment = sale.getByRole('region', { name: 'Seat assignment' });
  await assignment.getByLabel('Seating section').selectOption({ label: 'Balcony' });
  await assignment.getByLabel('Ticket type name').fill('Reserved');
  await assignment.getByLabel('Price in VND').fill('100000');
  await assignment.getByRole('button', { name: 'Add seated ticket type' }).click();
  const reserved = assignment.getByRole('option', { name: /^Reserved ·/ });
  await assignment.getByLabel('Assign seats to').selectOption({ value: await reserved.getAttribute('value') });
  await assignment.getByRole('button', { name: 'Assign unassigned seats in row A' }).click();
  assert.equal(await page.getByRole('button', { name: 'Publish performance' }).count(), 0);
  await sale.getByRole('button', { name: 'Save and review' }).click();
  const review = page.getByRole('region', { name: 'Review performance' });
  await review.getByText('Standing', { exact: true }).waitFor();
  await review.getByText('Reserved', { exact: true }).waitFor();
  await inspectViewport('review-hybrid');
  await review.getByRole('button', { name: 'Publish performance' }).click();
  const publication = page.getByRole('region', { name: 'Publication status' });
  await publication.getByText('Synchronized', { exact: true }).nth(1).waitFor();
  await review.getByRole('button', { name: 'Edit tickets and map' }).click();
  await sale.getByRole('group', { name: 'Reserved' }).getByLabel('Price in VND').fill('150000');
  await sale.getByRole('button', { name: 'Publish sale revision' }).click();
  await page.getByRole('status').filter({ hasText: 'Publication submitted.' }).waitFor();

  const hybrid = (await readEvent()).performances[0];
  assert.equal(hybrid.saleVersion, 3);
  assert.equal(hybrid.maxPerAccount, 6);
  assert.equal(new Date(hybrid.startsAt).toISOString(), new Date(showStart + '+07:00').toISOString());

  await page.getByRole('button', { name: 'Add performance', exact: true }).click();
  await page.getByLabel('Venue / space').selectOption({ label: 'Landmark Arena · Main hall' });
  await fillSchedule(localTime(72), localTime(76));
  await page.getByRole('button', { name: 'Save and continue' }).click();
  const generalAdmission = sale.getByRole('form', { name: 'Add general admission ticket' });
  await generalAdmission.getByLabel('Ticket type name').fill('General Admission');
  await generalAdmission.getByLabel('Capacity', { exact: true }).fill('150');
  await generalAdmission.getByLabel('Price in VND', { exact: true }).fill('250000');
  await generalAdmission.getByRole('button', { name: 'Add general admission ticket' }).click();
  await sale.getByRole('button', { name: 'Save and review' }).click();
  await review.getByText('General admission without a map', { exact: true }).waitFor();
  await inspectViewport('review-ga');
  await review.getByRole('button', { name: 'Publish performance' }).click();
  await publication.getByText('Synchronized', { exact: true }).nth(1).waitFor();
  const ga = (await readEvent()).performances.find(entry => entry.id !== hybrid.id);
  assert.equal(ga.layoutVersion, null);
  const availability = await context.request.get('/api/v2/performances/' + ga.id + '/availability');
  assert.equal(availability.status(), 200, await availability.text());
  const inventory = (await availability.json()).data.groups[0];
  assert.equal(inventory.available, 150);
  assert.equal(inventory.offers[0].price, 250000);
  console.log('Organizer resumed and edited a saved concert, then published two performances with hybrid and mapless inventory.');
} finally {
  await browser.close();
}
