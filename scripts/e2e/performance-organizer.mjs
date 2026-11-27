import { advanceApprovedPerformanceReview, submitPerformanceReview, submitReviewFromPage } from './performance-review-fixture.mjs';
import { selectWorkspaceOption } from './select-workspace-option.mjs';
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

async function fillSchedule(start, end, { doors = '', saleOpen = localTime(1), saleClose = localTime(24) } = {}) {
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

const editor = page.getByRole('region', { name: 'Venue layout' });
const canvas = editor.locator('svg[data-layout-canvas]');

async function screenPoint(x, y) {
  return canvas.evaluate((svg, { x, y }) => {
    const point = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return { x: point.x, y: point.y };
  }, { x, y });
}

async function drag(x, y, nextX, nextY) {
  await canvas.scrollIntoViewIfNeeded();
  const from = await screenPoint(x, y);
  const to = await screenPoint(nextX, nextY);
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(to.x, to.y, { steps: 6 });
  await page.mouse.up();
}

async function rename(label) {
  await editor.getByLabel('Display name').fill(label);
  await editor.getByRole('button', { name: 'Rename', exact: true }).click();
}

async function draw(kind, label, from, to) {
  await editor.getByRole('button', { name: kind, exact: true }).click();
  await editor.getByRole('button', { name: 'Rectangle', exact: true }).click();
  await drag(...from, ...to);
  await rename(label);
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

  await page.goto('/organizer');
  await page.locator('main').getByRole('link', { name: 'Create concert' }).click();
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
  const venuePicker = page.getByRole('combobox', { name: 'Venue / space' });
  await venuePicker.getByText('Landmark Arena · Main hall').waitFor();

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
  await page.getByRole('button', { name: 'Zones and reserved seats' }).click();
  await page.getByRole('button', { name: 'Add seating map' }).click();
  await page.getByRole('heading', { name: 'Seating map', level: 1 }).waitFor();
  assert.ok(await progress.isHidden());
  assert.equal(await editor.getByLabel(/X coordinate|Y coordinate/).count(), 0);
  await editor.getByRole('button', { name: 'Standing zone', exact: true }).click();
  await editor.getByRole('button', { name: 'Freeform outline', exact: true }).click();
  await canvas.scrollIntoViewIfNeeded();
  for (const [x, y] of [[25, 65], [230, 65], [245, 285], [160, 310], [25, 285]]) {
    const point = await screenPoint(x, y);
    await page.mouse.click(point.x, point.y);
  }
  await editor.getByRole('button', { name: 'Finish outline', exact: true }).click();
  await rename('Floor');
  await draw('Seated section', 'Balcony', [300, 65], [490, 310]);
  await editor.getByLabel('Number of rows').fill('2');
  await editor.getByLabel('Seats per row').fill('4');
  await editor.getByLabel('Leave a center aisle').check();
  await inspectViewport('seat-generation');
  await editor.getByRole('button', { name: 'Generate 8 seats' }).click();
  await page.getByRole('button', { name: 'Back to ticket setup' }).click();
  await progress.waitFor();
  await page.getByRole('button', { name: 'Open seating map', exact: true }).click();
  const originalId = await editor.getByRole('combobox', { name: 'Map objects' }).getAttribute('data-value');
  const group = canvas.locator(`[data-map-section="${originalId}"]`);
  const originalSeats = await group.locator('[data-map-seat]').evaluateAll((nodes) => nodes.map(
    (seat) => seat.getAttribute('data-map-seat'),
  ));
  assert.equal(originalSeats.length, 8);
  await drag(310, 76, 325, 90);
  const rightCorner = await canvas.locator('[data-map-resize] .performance-map-canvas-grip').evaluate((grip) => [
    Number(grip.getAttribute('cx')), Number(grip.getAttribute('cy')),
  ]);
  await drag(...rightCorner, rightCorner[0] + 22, rightCorner[1] + 18);
  assert.deepEqual(await group.locator('[data-map-seat]').evaluateAll((nodes) => nodes.map(
    (seat) => seat.getAttribute('data-map-seat'),
  )), originalSeats);
  await editor.getByRole('button', { name: 'Duplicate', exact: true }).click();
  assert.equal(await canvas.locator('[data-map-section]').count(), 3);
  await editor.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(await canvas.locator('[data-map-section]').count(), 2);
  await editor.getByRole('button', { name: 'Redo', exact: true }).click();
  assert.equal(await canvas.locator('[data-map-section]').count(), 3);
  await editor.getByRole('button', { name: 'Undo', exact: true }).click();

  await editor.getByRole('button', { name: 'Stage', exact: true }).click();
  await editor.getByRole('button', { name: 'Add in available space' }).press('Enter');
  assert.equal(await canvas.locator('[data-map-shape]').count(), 1);
  await editor.getByRole('button', { name: 'Zoom in', exact: true }).click();
  await editor.getByRole('button', { name: 'Fit map', exact: true }).click();
  await selectWorkspaceOption(editor.getByLabel('Map objects'), { value: originalId });
  await inspectViewport('layout-editor');

  await editor.getByText('Import or reuse a map', { exact: true }).click();
  const csv = editor.getByLabel('Import seats from CSV');
  const help = await editor.getByText(/Section codes include/).innerText();
  const code = /include (.+)\./.exec(help)?.[1];
  assert.ok(code);
  await csv.setInputFiles({ name: 'invalid.csv', mimeType: 'text/csv', buffer: Buffer.from(`section,row,seat,x,y
${code},Z,1,,125`) });
  await editor.getByRole('alert').filter({ hasText: 'line 2' }).waitFor();
  await csv.setInputFiles({ name: 'balcony.csv', mimeType: 'text/csv', buffer: Buffer.from(`section,row,seat,x,y
${code},Z,1,350,125
${code},Z,2,365,125`) });
  await editor.getByRole('status').filter({ hasText: 'Imported 2 seats' }).waitFor();
  await editor.getByRole('button', { name: 'Save layout' }).click();
  await editor.getByRole('status').filter({ hasText: 'Saved.' }).waitFor();
  const layoutPath = organizerApi + '/performances/' + savedPerformance.id + '/layout';
  const persistedResponse = await context.request.get(layoutPath, { headers: auth });
  assert.ok(persistedResponse.ok());
  const persisted = (await persistedResponse.json()).data.layout;
  const balcony = persisted.sections.find(section => section.id === originalId);
  assert.deepEqual(balcony.rows[0].seats.map(seat => seat.id), originalSeats.slice(0, 4));
  assert.ok(Math.abs(balcony.points[0].x - 315) < 2 && Math.abs(balcony.points[0].y - 79) < 2);
  assert.ok(Math.abs(balcony.points[2].x - 527) < 2 && Math.abs(balcony.points[2].y - 342) < 2);
  assert.equal(balcony.rows.length, 3);
  await editor.getByText('Import or reuse a map', { exact: true }).click();
  await editor.getByLabel('Template name', { exact: true }).fill('Arena with standing floor');
  await editor.getByRole('button', { name: 'Save as a venue template' }).click();
  await editor.getByRole('status').filter({ hasText: 'Saved to venue templates.' }).waitFor();
  await page.getByRole('button', { name: 'Continue to tickets' }).click();

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
  await selectWorkspaceOption(assignment.getByLabel('Seating section'), { label: 'Balcony' });
  await assignment.getByLabel('Ticket type name').fill('Reserved');
  await assignment.getByLabel('Price in VND').fill('100000');
  await assignment.getByRole('button', { name: 'Add seated ticket type' }).click();
  await selectWorkspaceOption(assignment.getByLabel('Assign seats to'), { label: /^Reserved ·/ });
  await assignment.getByRole('button', { name: 'Assign remaining seats in section' }).click();
  assert.equal(await page.getByRole('button', { name: 'Submit for review' }).count(), 0);
  await sale.getByRole('button', { name: 'Save and review' }).click();
  const review = page.getByRole('region', { name: 'Review performance' });
  await review.getByText('Standing', { exact: true }).waitFor();
  await review.getByText('Reserved', { exact: true }).waitFor();
  await inspectViewport('review-hybrid');
  await submitPerformanceReview(review, context.request, admin.accessToken, { openSale: true });
  const publication = page.getByRole('region', { name: 'Publication status' });
  await publication.getByText('Synchronized', { exact: true }).nth(1).waitFor();
  await review.getByRole('button', { name: 'Edit tickets and map' }).click();
  assert.equal(await sale.getByRole('button', { name: 'Publish sale revision' }).count(), 0);

  const hybrid = (await readEvent()).performances[0];
  assert.equal(hybrid.saleVersion, 2);
  assert.equal(hybrid.maxPerAccount, 6);
  assert.equal(new Date(hybrid.startsAt).toISOString(), new Date(showStart + '+07:00').toISOString());

  await page.getByRole('button', { name: 'Add performance', exact: true }).click();
  await selectWorkspaceOption(page.getByLabel('Venue / space'), { label: 'Landmark Arena · Main hall' });
  await fillSchedule(localTime(72), localTime(76));
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('button', { name: 'General admission', exact: true }).click();
  const generalAdmission = sale.getByRole('form', { name: 'Add general admission ticket' });
  await generalAdmission.getByLabel('Ticket type name').fill('General Admission');
  await generalAdmission.getByLabel('Capacity', { exact: true }).fill('150');
  await generalAdmission.getByLabel('Price in VND').fill('250000');
  await generalAdmission.getByRole('button', { name: 'Add general admission ticket' }).click();
  await sale.getByRole('button', { name: 'Save and review' }).click();
  await review.getByText('General admission without a map', { exact: true }).waitFor();
  await inspectViewport('review-ga');
  const submission = await submitReviewFromPage(review);
  const adminWorkspace = await browser.newContext({ baseURL, locale: 'en-US', viewport: { width: 1440, height: 900 } });
  await adminWorkspace.addCookies([{ name: 'ticketbox_auth_token', value: admin.accessToken, url: baseURL }]);
  const reviewer = await adminWorkspace.newPage();
  reviewer.setDefaultTimeout(15_000);
  const reviewPath = `/admin/event-review?performanceId=${submission.review.performanceId}&state=SUBMITTED`;
  await reviewer.goto(`/admin/events/${event}?show=${submission.review.performanceId}`);
  await reviewer.locator('main').getByRole('link', { name: 'Open review' }).click();
  const reason = 'Set the account limit to three for the second show.';
  await reviewer.getByLabel('Reason', { exact: true }).fill(reason);
  const requestChanges = reviewer.waitForResponse(response =>
    response.url().endsWith('/performance-reviews/' + submission.review.performanceId) && response.request().method() === 'POST');
  await reviewer.getByRole('button', { name: 'Request changes', exact: true }).click();
  const changed = await requestChanges;
  assert.equal(changed.status(), 200, await changed.text());

  await page.goto('/organizer/events?status=CHANGES_REQUESTED');
  await page.getByText(reason, { exact: true }).waitFor();
  await page.locator('main').getByRole('link', { name: title, exact: true }).click();
  assert.equal(new URL(page.url()).searchParams.get('show'), submission.review.performanceId);
  await review.getByText(reason, { exact: true }).waitFor();
  await review.getByRole('button', { name: 'Edit schedule', exact: true }).click();
  await page.getByLabel('Ticket limit per account').fill('3');
  await page.getByRole('button', { name: 'Save and continue', exact: true }).click();
  await sale.getByRole('button', { name: 'Save and review', exact: true }).click();
  const resubmitted = await submitReviewFromPage(review);
  assert.notEqual(resubmitted.review.id, submission.review.id);

  await reviewer.goto(reviewPath);
  const approve = reviewer.waitForResponse(response =>
    response.url().endsWith('/performance-reviews/' + submission.review.performanceId) && response.request().method() === 'POST');
  await reviewer.getByRole('button', { name: 'Approve schedule', exact: true }).click();
  const approved = await approve;
  assert.equal(approved.status(), 200, await approved.text());
  advanceApprovedPerformanceReview(resubmitted.review, { openSale: true });
  await publication.getByText('Synchronized', { exact: true }).nth(1).waitFor();
  const ga = (await readEvent()).performances.find(entry => entry.id !== hybrid.id);
  assert.equal(ga.layoutVersion, null);
  assert.equal(ga.maxPerAccount, 3);
  const availability = await context.request.get('/api/v2/performances/' + ga.id + '/availability');
  assert.equal(availability.status(), 200, await availability.text());
  const inventory = (await availability.json()).data.groups[0];
  assert.equal(inventory.available, 150);
  assert.equal(inventory.offers[0].price, 250000);
  for (const [view, scope] of [[reviewer, 'admin'], [page, 'organizer']]) {
    await view.goto(`/${scope}/events/${event}?show=${ga.id}`);
    await view.getByRole('navigation', { name: 'Concert navigation' }).getByRole('link', { name: 'View report', exact: true }).click();
    // Organizers land on the Sales report (filtered to this show); Admin keeps the operational performance list.
    if (scope === 'admin') await view.getByRole('link', { name: new RegExp('Open performance for ' + title) }).waitFor();
    else await view.getByLabel('Sales summary').getByText('Net sales', { exact: true }).waitFor();
    assert.equal(new URL(view.url()).searchParams.get('performanceId'), ga.id);
    await view.getByRole('link', { name: 'Back to concert', exact: true }).click();
    assert.equal(new URL(view.url()).searchParams.get('show'), ga.id);
  }
  console.log('Organizer resumed a two-show concert, corrected the second submission, and both roles opened its report.');
} finally {
  await browser.close();
}
