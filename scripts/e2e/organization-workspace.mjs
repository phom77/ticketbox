import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18092';
const output = process.env.ORGANIZATION_UI_OUTPUT ?? '.artifacts/e2e/organization-workspace';
await mkdir(output, { recursive: true });

const suffix = randomUUID().slice(0, 8);
const firstName = `Buổi diễn A ${suffix}`;
const secondName = `Buổi diễn B ${suffix}`;
const browser = await chromium.launch({ headless: true });

async function session(role, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ baseURL, viewport });
  const login = await context.request.post('/api/auth/login', {
    data: { email: `${role}@ticketbox.com`, password: 'password123' },
  });
  assert.equal(login.status(), 200);
  const { accessToken, user } = (await login.json()).data;
  await context.addCookies([{ name: 'ticketbox_auth_token', value: accessToken, url: baseURL }]);
  return { context, user, accessToken, page: await context.newPage() };
}

async function approve(page, name, manager) {
  const panel = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Duyệt tổ chức' }) });
  await panel.getByLabel('Tên tổ chức').fill(name);
  await panel.getByLabel('Mã tài khoản quản lý', { exact: true }).fill(manager);
  await panel.getByRole('button', { name: 'Duyệt tổ chức' }).click();
  await page.getByRole('listitem').filter({ hasText: name }).waitFor();
}

async function fits(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, label);
}

try {
  const admin = await session('admin');
  const organizer = await session('organizer');
  const audience = await session('audience');

  await admin.page.goto('/admin/organizations');
  await approve(admin.page, firstName, organizer.user.id);
  await approve(admin.page, secondName, audience.user.id);

  await organizer.page.goto('/organizer');
  await organizer.page.getByLabel('Tổ chức đang làm việc').selectOption({ label: firstName });
  await organizer.page.getByRole('heading', { name: firstName, exact: true }).waitFor();
  await organizer.page.locator('.operations-nav').getByRole('link', { name: 'Thành viên' }).click();
  await organizer.page.getByRole('heading', { name: 'Mời thành viên' }).waitFor();
  await organizer.page.getByLabel('Mã tài khoản người nhận').fill(audience.user.id);
  await organizer.page.getByRole('checkbox', { name: 'Xem đơn hàng và doanh thu' }).first().check();
  await organizer.page.getByRole('button', { name: 'Tạo lời mời' }).click();
  const invitation = organizer.page.getByRole('status').filter({ hasText: 'Gửi mã này' });
  await invitation.waitFor();
  const code = await invitation.locator('code').textContent();
  assert.ok(code);
  await organizer.page.screenshot({ path: `${output}/members-desktop.png`, animations: 'disabled',
    mask: [invitation] });

  await audience.page.goto('/organizer');
  await audience.page.getByLabel('Mã lời mời').fill(code);
  await audience.page.getByRole('button', { name: 'Tham gia tổ chức' }).click();
  await audience.page.getByRole('heading', { name: firstName, exact: true }).waitFor();
  const navigation = audience.page.locator('.operations-nav');
  assert.equal(await navigation.getByRole('link', { name: 'Buổi diễn' }).count(), 0);
  await navigation.getByRole('link', { name: 'Doanh thu' }).waitFor();
  await audience.page.goto('/organizer/concerts');
  await audience.page.getByText('Tổ chức đang chọn chưa cấp quyền cho mục này.').waitFor();

  for (const width of [1440, 834, 390]) {
    await audience.page.setViewportSize({ width, height: 900 });
    const selection = audience.page.getByLabel('Tổ chức đang làm việc');
    await selection.selectOption({ label: secondName });
    await audience.page.getByRole('heading', { name: secondName, exact: true }).waitFor();
    await navigation.getByRole('link', { name: 'Buổi diễn' }).waitFor({ state: 'attached' });
    await selection.focus();
    assert.equal(await selection.evaluate((node) => node === document.activeElement), true);
    await fits(audience.page, `Organization workspace at ${width}px`);
    await audience.page.screenshot({ path: `${output}/overview-${width}.png`, animations: 'disabled' });
    await selection.selectOption({ label: firstName });
    await audience.page.getByRole('heading', { name: firstName, exact: true }).waitFor();
    assert.equal(await navigation.getByRole('link', { name: 'Buổi diễn' }).count(), 0);
  }

  const orgs = await organizer.context.request.get('/api/organizations', {
    headers: { Authorization: `Bearer ${organizer.accessToken}` },
  });
  const organization = (await orgs.json()).data.find((item) => item.name === firstName);
  const title = `Mở bán ${suffix}`;
  const draft = await organizer.context.request.post('/api/organizer/manage/concerts', {
    headers: { Authorization: `Bearer ${organizer.accessToken}`, 'X-Organization-Id': organization.id },
    data: { title, venueName: 'Sân khấu thử', venueAddress: 'Địa chỉ thử',
      eventDate: new Date(Date.now() + 86400000 * 2).toISOString(),
      saleStartAt: new Date(Date.now() - 60000).toISOString(),
      saleEndAt: new Date(Date.now() + 86400000).toISOString() },
  });
  assert.equal(draft.status(), 201);
  const concert = (await draft.json()).data;
  const workspace = `/organizer/concerts/${concert.id}`;
  let checkinReady = false;
  for (let attempt = 0; attempt < 40 && !checkinReady; attempt += 1) {
    const summary = await organizer.context.request.get(`/api/organizer/manage/concerts/${concert.id}/checkin-summary`, {
      headers: { Authorization: `Bearer ${organizer.accessToken}`, 'X-Organization-Id': organization.id },
    });
    checkinReady = summary.ok();
    if (!checkinReady) await new Promise((resolve) => setTimeout(resolve, 500));
  }
  assert(checkinReady, 'Check-in received the new draft');
  const orderRequests = '**/api/organizer/manage/orders?*';
  await organizer.page.route(orderRequests, (route) => route.fulfill({ status: 503,
    json: { code: 503, message: 'Đơn hàng tạm gián đoạn' } }));
  let checkinRequests = 0;
  await organizer.page.route('**/checkin-summary', (route) => { checkinRequests += 1; return route.continue(); });
  const aiRequests = [];
  organizer.page.on('request', (request) => { if (request.url().includes('artist-bio')) aiRequests.push(request.url()); });
  await organizer.page.goto(workspace);
  await organizer.page.getByRole('heading', { name: title }).waitFor();
  await organizer.page.getByText('Thêm hạng vé đang hoạt động', { exact: false }).waitFor();
  assert(await organizer.page.getByRole('button', { name: 'Xác nhận mở bán' }).isDisabled());
  const preview = organizer.page.getByRole('link', { name: 'Xem trước' });
  await preview.focus();
  await organizer.page.keyboard.press('Enter');
  await organizer.page.getByText('Chế độ xem trước', { exact: true }).first().waitFor();
  assert.equal(await organizer.page.getByRole('link', { name: /Mua ngay|Vào phòng chờ/ }).count(), 0);
  await organizer.page.goto(`${workspace}?tab=operations`);
  const retryOrders = organizer.page.getByRole('alert').filter({ hasText: 'Đơn hàng tạm gián đoạn' })
    .getByRole('button', { name: 'Thử lại' });
  await retryOrders.waitFor();
  await organizer.page.getByText('Tổng vé', { exact: true }).waitFor();
  const previousCheckinRequests = checkinRequests;
  await organizer.page.unroute(orderRequests);
  await retryOrders.click();
  await organizer.page.getByRole('heading', { name: '0 đơn phát sinh' }).waitFor();
  assert.equal(checkinRequests, previousCheckinRequests);
  await organizer.page.getByRole('button', { name: 'Thông tin & lịch' }).click();
  await organizer.page.getByRole('heading', { name: 'Thông tin, lịch trình và sơ đồ' }).waitFor();
  assert.deepEqual(aiRequests, []);

  const tier = await organizer.context.request.post(`/api/organizer/manage/concerts/${concert.id}/ticket-types`, {
    headers: { Authorization: `Bearer ${organizer.accessToken}`, 'X-Organization-Id': organization.id },
    data: { name: 'GA', price: 100000, totalQuantity: 10, maxPerAccount: 2, zoneColor: '#123456' },
  });
  assert.equal(tier.status(), 201);
  await organizer.page.goto(workspace);
  await organizer.page.getByRole('button', { name: 'Xác nhận mở bán' }).click();
  await organizer.page.getByText('Buổi diễn đã được công khai theo lịch bán.').waitFor();
  for (const width of [1440, 834, 390]) {
    await organizer.page.setViewportSize({ width, height: 900 });
    await fits(organizer.page, `Publication workspace at ${width}px`);
    await organizer.page.screenshot({ path: `${output}/publication-${width}.png`, animations: 'disabled' });
  }
  await organizer.page.goto(`/concerts/${concert.id}`);
  await organizer.page.getByRole('heading', { name: title }).waitFor();
  assert.equal(await organizer.page.getByRole('link', { name: /Mua ngay|Vào phòng chờ/ }).count(), 0);
  await audience.page.goto(`/concerts/${concert.id}`);
  await audience.page.getByRole('link', { name: /Mua ngay|Vào phòng chờ/ }).waitFor();

  await organizer.page.goto('/organizer/reconciliation');
  await organizer.page.getByRole('heading', { name: 'Đối soát thanh toán' }).waitFor();
  await organizer.page.getByText('Không có giao dịch trong kỳ.').waitFor();
  for (const width of [1440, 834, 390]) {
    await organizer.page.setViewportSize({ width, height: 900 });
    await fits(organizer.page, `Reconciliation workspace at ${width}px`);
    await organizer.page.screenshot({ path: `${output}/reconciliation-${width}.png`, animations: 'disabled' });
  }
  console.log('Draft preview, independent retries, publication, buyer gate and finance workspace passed.');

  await audience.page.getByRole('link', { name: /Mua ngay|Vào phòng chờ/ }).click();
  await audience.page.waitForURL(`**/concerts/${concert.id}/seats`, { timeout: 45_000 });
  await audience.page.getByRole('button', { name: 'Thêm một vé GA' }).click();
  await audience.page.getByRole('button', { name: 'Tiếp tục thanh toán' }).click();
  await audience.page.waitForURL('**/checkout?orderId=*');
  const pay = audience.page.getByRole('button', { name: 'Tiếp tục với thanh toán demo' });
  await Promise.all([
    audience.page.waitForURL(/\/(payment\/result|booking-confirmation)(\?|$)/),
    pay.click(),
  ]);
  if (new URL(audience.page.url()).pathname !== '/booking-confirmation') {
    await audience.page.waitForURL('**/checkout?orderId=*');
    await pay.click();
  }
  await audience.page.getByRole('link', { name: 'Xem vé của tôi' }).waitFor();
  await fits(audience.page, 'Booking confirmation at 390px');
  await audience.page.goto('/profile?tab=orders');
  await audience.page.getByRole('region', { name: 'Lịch sử đơn hàng' })
    .getByRole('heading', { name: title }).waitFor();
  await audience.page.goto('/my-tickets');
  await audience.page.reload();
  const ticketGroup = audience.page.locator('.ticket-concert-card').filter({ hasText: title });
  const ticketSummary = ticketGroup.locator('.ticket-concert-summary');
  await ticketSummary.waitFor();
  if (await ticketSummary.getAttribute('aria-expanded') === 'false') await ticketSummary.click();
  await ticketGroup.locator('.ticket-row').click();
  const ticket = audience.page.getByRole('dialog', { name: title });
  await ticket.getByText('Ticket QR code', { exact: true }).waitFor();
  assert(await ticket.locator('svg.ticket-qr').isVisible());
  await fits(audience.page, 'Recovered ticket at 390px');
  console.log('Mobile buyer selected a ticket, paid with MOCK, recovered the order and opened the issued QR after reload.');

  console.log('Organization approval, invitation, grant guards and switching passed at 1440, 834 and 390 px.');
} finally {
  await browser.close();
}
