import { selectWorkspaceOption } from './select-workspace-option.mjs';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseURL = process.env.TICKETBOX_E2E_URL ?? 'http://localhost:18092';
const output = process.env.ORGANIZATION_UI_OUTPUT ?? '.artifacts/e2e/organization-workspace';
await mkdir(output, { recursive: true });

const suffix = randomUUID().slice(0, 8);
const firstName = `Buổi diễn A ${suffix}`;
const secondName = `Buổi diễn B ${suffix}`;
const browser = await chromium.launch({ headless: true });

async function session(email, viewport = { width: 1440, height: 900 }) {
  const context = await browser.newContext({ baseURL, locale: 'vi-VN', viewport });
  const origin = new URL(baseURL).origin;
  await context.route((url) => url.origin !== origin, (route) => route.abort());
  const page = await context.newPage();
  const login = async () => {
    const response = await context.request.post('/api/auth/login', {
      data: { email: email.includes('@') ? email : `${email}@ticketbox.com`, password: 'password123' },
    });
    assert.equal(response.status(), 200);
    const { accessToken, user } = (await response.json()).data;
    await context.addCookies([{ name: 'ticketbox_auth_token', value: accessToken, url: baseURL }]);
    return { accessToken, user };
  };
  return { context, page, login, ...(email ? await login() : {}) };
}

function compose(...args) {
  return execFileSync('docker', ['compose', '-p', process.env.E2E_PROJECT ?? 'ticketbox-e2e-split',
    '-f', 'compose.yaml', ...args], { encoding: 'utf8' });
}

function claimLink(email) {
  const serviceToken = process.env.SPLIT_SERVICE_TOKEN ?? 'ticketbox-local-split-service-token-change-before-deploy';
  const result = JSON.parse(compose('exec', '-T', 'smtp', 'node', '-e', `
    fetch('http://identity:8080/internal/split/organization-links/claim', {
      method: 'POST', headers: { 'X-Service-Token': process.argv[1] }
    }).then(response => response.json()).then(result => process.stdout.write(JSON.stringify(result)))
  `, serviceToken));
  assert.equal(result.email, email);
  return '/partner/activate#token=' + result.token;
}

async function onboard(admin, name, email) {
  const partner = await session('');
  await admin.page.goto('/admin/organizations');
  await admin.page.getByRole('button', { name: 'Tạo liên kết đăng ký riêng' }).click();
  const link = admin.page.getByLabel('Liên kết đăng ký riêng');
  await link.waitFor();
  await partner.page.goto(await link.inputValue());
  await partner.page.getByLabel('Tổ chức', { exact: true }).fill(name);
  await partner.page.getByLabel('Người quản lý', { exact: true }).fill(name);
  await partner.page.getByLabel('Email công việc').fill(email);
  await partner.page.getByLabel('Sự kiện đầu tiên').fill('Một buổi diễn thử nghiệm');
  await partner.page.getByRole('button', { name: 'Gửi hồ sơ' }).click();
  await partner.page.getByText('Đã gửi hồ sơ đăng ký.').waitFor();

  await admin.page.reload();
  await admin.page.getByRole('row').filter({ hasText: name }).getByRole('button', { name: 'Duyệt tổ chức' }).click();
  await admin.page.getByRole('row').filter({ hasText: name }).getByText('Đã duyệt').waitFor();
  await partner.page.goto(claimLink(email));
  await partner.page.getByLabel('Mật khẩu', { exact: true }).fill('password123');
  await partner.page.getByRole('button', { name: 'Kích hoạt tài khoản nhà tổ chức' }).click();
  await partner.page.getByText('Quyền nhà tổ chức đã được kích hoạt.').waitFor();
  await partner.context.close();
  return session(email);
}

async function fits(page, label) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, label);
}

try {
  const admin = await session('admin');
  const buyer = await session('audience', { width: 390, height: 900 });
  await buyer.page.goto('/organizer');
  await buyer.page.waitForURL((url) => url.pathname === '/');
  await buyer.page.goto('/partner/apply');
  await buyer.page.waitForURL((url) => url.pathname === '/');
  const unauthorized = await buyer.context.request.get('/api/organizations', {
    headers: { Authorization: `Bearer ${buyer.accessToken}` },
  });
  assert.equal(unauthorized.status(), 403);
  let organizer;
  const memberEmail = `partner-b-${suffix}@example.test`;
  compose('stop', 'notification');
  try {
    organizer = await onboard(admin, firstName, `partner-a-${suffix}@example.test`);
    const member = await onboard(admin, secondName, memberEmail);
    await organizer.page.goto('/organizer');
    await organizer.page.getByRole('heading', { name: firstName, exact: true }).waitFor();
    await organizer.page.locator('.operations-nav').getByRole('link', { name: 'Thành viên' }).click();
    await organizer.page.getByRole('button', { name: 'Mời thành viên', exact: true }).click();
    await organizer.page.getByLabel('Email công việc, mỗi dòng một địa chỉ').fill(memberEmail + '\ninvalid');
    await organizer.page.getByRole('checkbox', { name: 'Xem đơn hàng và doanh thu' }).first().check();
    await organizer.page.getByRole('button', { name: 'Tạo lời mời' }).click();
    await organizer.page.getByText('invalid · Email không hợp lệ').waitFor();
    await organizer.page.getByText(memberEmail + ' · Email đang chờ gửi').first().waitFor();
    await organizer.page.screenshot({ path: `${output}/members-desktop.png`, animations: 'disabled' });

    await member.page.goto(claimLink(memberEmail));
    await member.page.getByRole('button', { name: 'Tham gia tổ chức' }).click();
    await member.page.getByText('Quyền nhà tổ chức đã được kích hoạt.').waitFor();
    await member.page.getByRole('link', { name: /Không gian nhà tổ chức/ }).click();
    const selection = member.page.getByLabel('Tổ chức đang làm việc');
    await selectWorkspaceOption(selection, { label: firstName });
    await member.page.getByRole('heading', { name: firstName, exact: true }).waitFor();
    const navigation = member.page.locator('.operations-nav');
    const concertNavigation = member.page.getByRole('button', { name: 'Concert', exact: true });
    assert.equal(await concertNavigation.count(), 0);
    await navigation.getByRole('link', { name: 'Báo cáo', exact: true }).waitFor();
    await member.page.goto('/organizer/concerts');
    await member.page.getByText('Tổ chức đang chọn chưa cấp quyền cho mục này.').waitFor();
    for (const width of [1440, 834, 390]) {
      await member.page.setViewportSize({ width, height: 900 });
      await selectWorkspaceOption(selection, { label: secondName });
      await member.page.getByRole('heading', { name: secondName, exact: true }).waitFor();
      if (width <= 1150) await member.page.getByRole('button', { name: 'Mở điều hướng' }).click();
      await concertNavigation.click();
      const concerts = member.page.getByRole('navigation', { name: 'Điều hướng concert' });
      await concerts.getByRole('link', { name: 'Tất cả concert', exact: true }).waitFor();
      await concerts.getByRole('link', { name: 'Tạo concert', exact: true }).waitFor();
      if (width <= 1150) await member.page.keyboard.press('Escape');
      await fits(member.page, `Organization workspace at ${width}px`);
      await member.page.screenshot({ path: `${output}/overview-${width}.png`, animations: 'disabled' });
      await selectWorkspaceOption(selection, { label: firstName });
      await member.page.getByRole('heading', { name: firstName, exact: true }).waitFor();
      if (width <= 1150) await member.page.getByRole('button', { name: 'Mở điều hướng' }).click();
      assert.equal(await concertNavigation.count(), 0);
      if (width <= 1150) await member.page.keyboard.press('Escape');
    }
  } finally {
    compose('start', 'notification');
  }
  const audience = buyer;

  const orgs = await organizer.context.request.get('/api/organizations', {
    headers: { Authorization: `Bearer ${organizer.accessToken}` },
  });
  const organization = (await orgs.json()).data.find((item) => item.name === firstName);
  const title = `Mở bán ${suffix}`;
  const draft = await organizer.context.request.post('/api/organizer/manage/concerts', {
    headers: { Authorization: `Bearer ${organizer.accessToken}`, 'X-Organization-Id': organization.id },
    data: { title, venueName: 'Sân khấu thử', venueAddress: 'Địa chỉ thử',
      eventDate: new Date(Date.now() + 86400000 * 2).toISOString(),
      saleStartAt: new Date(Date.now() + 5 * 60000).toISOString(),
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
  const concertLinks = organizer.page.getByRole('navigation', { name: 'Điều hướng concert' });
  const guests = concertLinks.getByRole('link', { name: 'Khách mời', exact: true });
  await concertLinks.getByRole('link', { name: 'Hạng vé', exact: true }).click();
  await organizer.page.getByRole('link', { name: 'Quản lý hạng vé', exact: true }).click();
  assert.equal(new URL(organizer.page.url()).searchParams.get('returnTo'), `${workspace}?tab=tickets`);
  await organizer.page.goBack();
  await guests.click();
  await organizer.page.getByRole('link', { name: 'Lịch sử batch', exact: true }).click();
  assert.equal(new URL(organizer.page.url()).searchParams.get('concertId'), concert.id);
  await organizer.page.goBack();
  await guests.and(concertLinks.locator('[aria-current="page"]')).waitFor();
  await organizer.page.goForward();
  await organizer.page.waitForURL((url) => url.pathname === '/organizer/guests');
  assert.equal(new URL(organizer.page.url()).searchParams.get('returnTo'), `${workspace}?tab=guests`);
  await organizer.page.goto(`${workspace}?tab=details`);
  const englishFields = organizer.page.getByRole('group', { name: 'English' });
  const englishTitle = `English title ${suffix}`;
  await englishFields.getByLabel('Tên concert').fill(englishTitle);
  const language = organizer.page.getByRole('combobox', { name: 'Ngôn ngữ' });
  await selectWorkspaceOption(language, { value: 'en' });
  assert.equal(await englishFields.getByLabel('Event title').inputValue(), englishTitle);
  assert.equal(await organizer.page.getByRole('group', { name: 'Original text' }).getByLabel('Event title').inputValue(), title);
  assert.equal(await organizer.page.getByRole('group', { name: 'Tiếng Việt' }).getByLabel('Event title').inputValue(), '');
  await selectWorkspaceOption(organizer.page.getByRole('combobox', { name: 'Language' }), { value: 'vi' });
  const saved = organizer.page.waitForResponse((response) => response.request().method() === 'PUT' &&
    new URL(response.url()).pathname === `/api/organizer/manage/concerts/${concert.id}`);
  await organizer.page.locator('.concert-settings-form button[type=submit], .concert-settings-form button:not([type])').click();
  assert.equal((await saved).status(), 200);
  await organizer.page.goto(workspace);
  await organizer.page.getByText('Thêm hạng vé đang hoạt động', { exact: false }).waitFor();
  assert.equal(await organizer.page.getByRole('button', { name: 'Gửi duyệt', exact: true }).count(), 0);
  const preview = organizer.page.getByRole('link', { name: 'Xem trước' });
  await preview.focus();
  await organizer.page.keyboard.press('Enter');
  await organizer.page.getByText('Xem trước dành cho ban tổ chức', { exact: true }).first().waitFor();
  await selectWorkspaceOption(organizer.page.getByRole('combobox', { name: 'Ngôn ngữ' }), { value: 'en' });
  await organizer.page.getByRole('heading', { name: englishTitle, exact: true }).waitFor();
  await selectWorkspaceOption(organizer.page.getByRole('combobox', { name: 'Language' }), { value: 'vi' });
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
  const releaseTime = organizer.page.getByLabel('Giờ công khai (ICT)');
  assert.equal(await releaseTime.inputValue(), '');
  assert(await organizer.page.getByRole('button', { name: 'Gửi duyệt', exact: true }).isDisabled());
  await releaseTime.fill(new Date(Date.now() + 7 * 3600000 + 90000).toISOString().slice(0, 16));
  await organizer.page.getByRole('button', { name: 'Gửi duyệt', exact: true }).click();
  await organizer.page.getByText('Chờ duyệt', { exact: true }).waitFor();
  await admin.page.goto('/admin/event-review');
  await admin.page.getByRole('link', { name: title, exact: true }).click();
  await admin.page.getByRole('button', { name: 'Duyệt lịch' }).click();
  await admin.page.getByText('Đã lên lịch', { exact: true }).waitFor();
  assert.equal((await audience.context.request.get(`/api/concerts/${concert.id}`)).status(), 404);
  assert.match(concert.id, /^[\da-f-]{36}$/i);
  compose('exec', '-T', 'catalog-db', 'psql', '-U', 'catalog_owner', '-d', 'ticketbox_catalog', '-c',
    `UPDATE concert_publication_reviews SET publish_at=now()-interval '1 second' WHERE concert_id='${concert.id}'`);
  await organizer.page.getByText('Đã công khai', { exact: true }).waitFor({ timeout: 60000 });
  for (const width of [1440, 834, 390]) {
    await organizer.page.setViewportSize({ width, height: 900 });
    await fits(organizer.page, `Publication workspace at ${width}px`);
    await organizer.page.screenshot({ path: `${output}/publication-${width}.png`, animations: 'disabled' });
  }
  await organizer.page.goto(`/concerts/${concert.id}`);
  await organizer.page.getByRole('heading', { name: title }).waitFor();
  assert.equal(await organizer.page.getByRole('link', { name: /Mua ngay|Vào phòng chờ/ }).count(), 0);
  await audience.page.goto(`/events?status=upcoming&q=${encodeURIComponent(title)}`);
  await audience.page.getByRole('main').getByRole('link', { name: `${title} · Xem sự kiện`, exact: true }).waitFor();
  compose('exec', '-T', 'catalog-db', 'psql', '-U', 'catalog_owner', '-d', 'ticketbox_catalog', '-c',
    `UPDATE concerts SET sale_start_at=now()-interval '1 minute' WHERE id='${concert.id}'`);
  await admin.page.waitForTimeout(4000);
  await audience.page.goto(`/?q=${encodeURIComponent(title)}`);
  await audience.page.getByRole('main').getByRole('link', { name: `${title} · Tìm vé`, exact: true }).click();
  await audience.page.waitForURL(`**/concerts/${concert.id}`);
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
  await audience.page.waitForURL(`**/events/${concert.id}/tickets`, { timeout: 45_000 });
  await audience.page.getByRole('button', { name: 'Thêm một vé GA' }).click();
  await audience.page.getByRole('button', { name: 'Tiếp tục thanh toán' }).click();
  await audience.page.waitForURL('**/checkout?orderId=*');
  const pay = audience.page.getByRole('button', { name: 'Tiếp tục với thanh toán demo' });
  await Promise.all([
    audience.page.waitForURL(/\/(payment\/result|orders\/[^/]+\/confirmation)(\?|$)/),
    pay.click(),
  ]);
  if (!/^\/orders\/[^/]+\/confirmation$/.test(new URL(audience.page.url()).pathname)) {
    await audience.page.waitForURL('**/checkout?orderId=*');
    await pay.click();
  }
  await audience.page.getByRole('link', { name: 'Xem vé của tôi' }).waitFor();
  await fits(audience.page, 'Booking confirmation at 390px');
  await audience.page.goto('/profile?tab=orders');
  const purchasedOrder = audience.page.getByRole('region', { name: 'Lịch sử đơn hàng' })
    .getByRole('article', { name: title, exact: true });
  const eventTickets = purchasedOrder.locator(`a[href="/my-tickets?concertId=${concert.id}"]`);
  await eventTickets.click();
  await audience.page.waitForURL(`**/my-tickets?concertId=${concert.id}`);
  await audience.page.getByRole('article', { name: title, exact: true })
    .getByRole('button', { name: /^Mở mã QR · / }).waitFor();
  await audience.page.goto('/my-tickets');
  await audience.page.reload();
  const ticketGroup = audience.page.getByRole('article', { name: title, exact: true });
  await ticketGroup.getByRole('button', { name: `Xem vé · ${title}`, exact: true }).click();
  const openTicket = ticketGroup.getByRole('button', { name: /^Mở mã QR · / });
  const ticketReference = (await openTicket.getAttribute('aria-label')).split(' · ')[1];
  await openTicket.click();
  const ticket = audience.page.getByRole('dialog', { name: title });
  await ticket.getByRole('img', { name: `Mã QR vé cho ${title}`, exact: true }).waitFor();
  await fits(audience.page, 'Recovered ticket at 390px');
  await audience.page.getByRole('button', { name: 'Đóng chi tiết vé' }).click();
  await audience.page.getByRole('banner').getByRole('button', { name: 'Mở menu tài khoản' }).click();
  await audience.page.getByRole('combobox', { name: 'Ngôn ngữ' }).selectOption('en');
  await audience.page.keyboard.press('Escape');
  await audience.page.getByRole('article', { name: englishTitle, exact: true })
    .getByRole('button', { name: `Show QR code · ${ticketReference}`, exact: true }).click();
  const englishTicket = audience.page.getByRole('dialog', { name: englishTitle });
  await englishTicket.getByRole('img', { name: `Ticket QR code for ${englishTitle}`, exact: true }).waitFor();
  console.log('Mobile buyer found the event, paid with MOCK, opened the event tickets from the paid order and recovered the QR after reload.');

  const administration = `/api/admin/concerts/${concert.id}/publication`;
  const adminHeaders = { Authorization: `Bearer ${admin.accessToken}` };
  const heldVersion = (await (await admin.context.request.get(administration, { headers: adminHeaders })).json()).data.review.id;
  const hold = await admin.context.request.post(administration + '/hold', {
    headers: adminHeaders, data: { revision: heldVersion, reason: 'Isolated publication hold' },
  });
  assert.equal(hold.status(), 200);
  assert.equal((await audience.context.request.get(`/api/concerts/${concert.id}`)).status(), 404);
  await englishTicket.getByRole('img', { name: `Ticket QR code for ${englishTitle}`, exact: true }).waitFor();

  const resume = await admin.context.request.post(administration, {
    headers: adminHeaders, data: { publishAt: new Date(Date.now() + 90000).toISOString() },
  });
  assert.equal(resume.status(), 200);
  const revision = (await resume.json()).data.review.id;
  assert.match(revision, /^[\da-f-]{36}$/i);
  const decision = await admin.context.request.post(administration + '/decision', {
    headers: adminHeaders, data: { revision, decision: 'APPROVE' },
  });
  assert.equal(decision.status(), 200);
  assert.equal((await audience.context.request.get(`/api/concerts/${concert.id}`)).status(), 404);
  compose('exec', '-T', 'catalog-db', 'psql', '-U', 'catalog_owner', '-d', 'ticketbox_catalog', '-c',
    `UPDATE concert_publication_reviews SET publish_at=now()-interval '1 second' WHERE id='${revision}'`);
  await audience.page.goto('/');
  await audience.page.waitForFunction(async (id) => (await fetch('/api/concerts/' + id)).ok, concert.id, { timeout: 60000 });
  console.log('The platform hold hid the event and kept the issued QR accessible. A reviewed reopening restored the event.');

  console.log('Organization approval, invitation, grant guards and switching passed at 1440, 834 and 390 px.');
} finally {
  await browser.close();
}
