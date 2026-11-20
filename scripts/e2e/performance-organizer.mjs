import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18105';
assert.ok(['localhost', '127.0.0.1'].includes(new URL(baseURL).hostname), 'Use an isolated loopback deployment');
const browser = await chromium.launch();
const context = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
page.setDefaultTimeout(15_000);
const suffix = randomUUID().slice(0, 8);
const organizationName = 'Layout rehearsal ' + suffix;
const title = 'Arena sessions ' + suffix;
const time = (hours) => new Date(Date.now() + hours * 3_600_000).toISOString();
const organizerApi = '/api/organizer/manage/v2';

async function login(role) {
  const response = await context.request.post('/api/auth/login', {
    data: { email: role + '@ticketbox.com', password: 'password123' },
  });
  assert.equal(response.status(), 200);
  return (await response.json()).data;
}

async function openForm(group) {
  await page.locator('summary').getByText(group, { exact: true }).click();
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
  await page.getByLabel('Title', { exact: true }).fill(title);
  await page.getByRole('button', { name: 'Create event' }).click();
  await page.getByRole('heading', { name: title }).waitFor();
  await openForm('Add venue');
  await page.getByLabel('Venue name').fill('Landmark Arena');
  await page.getByLabel('Address', { exact: true }).fill('Arena Lane');
  await page.getByLabel('Space name').fill('Main hall');
  await page.getByRole('button', { name: 'Add venue' }).click();

  await openForm('Add performance');
  await page.locator('input[name="startsAt"]').fill(time(48));
  await page.locator('input[name="endsAt"]').fill(time(52));
  await page.locator('input[name="doorsOpenAt"]').fill(time(47));
  await page.locator('input[name="saleStartAt"]').fill(time(-2));
  await page.locator('input[name="saleEndAt"]').fill(time(24));
  await page.getByRole('button', { name: 'Add performance' }).click();
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
  await sale.getByRole('button', { name: 'Add inventory group' }).click();
  await sale.getByRole('button', { name: 'Add inventory group' }).click();
  await sale.getByRole('button', { name: 'A', exact: true }).click();
  await sale.getByRole('button', { name: 'Add offer' }).click();
  await sale.getByRole('group', { name: 'Sale offer' }).getByLabel('Name', { exact: true }).fill('Standing');
  await sale.getByRole('button', { name: 'Add offer' }).click();
  const reserved = sale.getByRole('group', { name: 'Sale offer' });
  await reserved.getByLabel('Inventory group').selectOption({ label: 'Balcony' });
  await reserved.getByLabel('Name', { exact: true }).fill('Reserved');
  await sale.getByRole('button', { name: 'Publish performance' }).click();
  const publication = page.getByRole('region', { name: 'Publication status' });
  await publication.getByText('Synchronized', { exact: true }).nth(1).waitFor();
  await sale.getByRole('group', { name: 'Reserved' }).getByLabel('Price in VND').fill('150000');
  await sale.getByRole('button', { name: 'Publish sale revision' }).click();
  await page.getByRole('status').filter({ hasText: 'Publication submitted.' }).waitFor();

  const event = new URL(page.url()).pathname.split('/').at(-1);
  const details = await context.request.get(organizerApi + '/events/' + event, {
    headers: { Authorization: 'Bearer ' + organizer.accessToken, 'X-Organization-Id': organization },
  });
  assert.equal((await details.json()).data.performances[0].saleVersion, 3);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
  console.log('Organizer created a hybrid map, imported seats, published and revised pricing.');
} finally {
  await browser.close();
}
