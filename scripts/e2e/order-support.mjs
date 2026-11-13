// Run against the built frontend. The fixture checks requests and renders API responses.
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { dirname, extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const dist = resolve(root, process.env.ORDER_SUPPORT_UI_DIST || 'frontend/dist');
const output = resolve(root, process.env.ORDER_SUPPORT_UI_OUTPUT || '.artifacts/e2e/order-support');
const types = { '.css': 'text/css', '.js': 'text/javascript', '.html': 'text/html', '.svg': 'image/svg+xml' };
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  const asset = resolve(dist, `.${pathname}`);
  const file = asset.startsWith(dist + sep) && extname(asset) ? asset : resolve(dist, 'index.html');
  try {
    const body = await readFile(file);
    response.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream' });
    response.end(body);
  } catch {
    response.writeHead(404);
    response.end();
  }
});
await new Promise((done) => server.listen(0, '127.0.0.1', done));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch();
const concertId = '22222222-2222-4222-8222-222222222222';
const order = (id, concertTitle) => ({ id, concertId, concertTitle, status: 'PAID',
  totalAmount: 250000, createdAt: '2026-11-12T00:00:00Z', expiresAt: '2026-11-12T00:30:00Z', items: [] });
const first = order('11111111-1111-4111-8111-111111111111', 'Buổi diễn A');
const second = order('22222222-2222-4222-8222-222222222222', 'Buổi diễn B');
const legacy = order('33333333-3333-4333-8333-333333333333', 'Danh sách cũ');
const organizations = [{ id: 'org-a', name: 'Tổ chức A', grants: ['FINANCE'] },
  { id: 'org-b', name: 'Tổ chức B', grants: ['FINANCE'] }];
const checks = [];

const requesterId = '00000000-0000-4000-8000-000000000000';
const approverId = '00000000-0000-4000-8000-000000000001';

async function fixture(role, { actor = requesterId, refund, disruption } = {}) {
  const user = { sub: actor, email: 'fixture@test.invalid',
    fullName: 'Quản trị thử', role, exp: Math.floor(Date.now() / 1000) + 3600 };
  const token = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(user)).toString('base64url')}.fixture`;
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await context.addCookies([{ name: 'ticketbox_auth_token', value: token, url: origin }]);
  const page = await context.newPage();
  page.setDefaultTimeout(6_000);
  const state = { searches: [], errorStatus: 0, sections: [], deliveryUnavailable: false };
  const queueState = { requests: [], actions: [], loadUnavailable: false, completed: new Set() };
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' };
    const reply = (data, status = 200) => route.fulfill({ status, headers: cors,
      json: { code: status, data, message: 'Fixture' } });
    if (!url.pathname.startsWith('/api/')) return url.origin === origin ? route.continue() : route.abort();
    if (request.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (url.pathname === '/api/auth/me') return reply({ ...user, id: user.sub });
    if (url.pathname === '/api/organizations') return reply(disruption
      ? organizations.map((org) => ({ ...org, grants: [...org.grants, 'EVENTS'] })) : organizations);
    if (disruption && [`/api/admin/concerts/${concertId}`, `/api/organizer/manage/concerts/${concertId}`].includes(url.pathname)) {
      return reply({ id: concertId, title: 'Buổi diễn thử', venueName: 'Hội trường',
        eventDate: new Date(Date.now() + 86_400_000).toISOString(), saleStartAt: new Date().toISOString(),
        status: 'ON_SALE', ticketTypes: [], description: '', venueAddress: '', updatedAt: new Date().toISOString() });
    }
    if (disruption && url.pathname.startsWith(`/api/admin/concerts/${concertId}/disruption`)) {
      disruption.requests.push(url.pathname + url.search);
      if (url.pathname.endsWith('/impact')) {
        const page = Number(url.searchParams.get('page'));
        return reply({ content: [{ orderId: page ? second.id : first.id, status: 'PAID',
          paymentState: 'SUCCEEDED', amount: 250000, casePrepared: !!disruption.current?.processed }],
        page, size: Number(url.searchParams.get('size')), totalElements: 11, totalPages: 2 });
      }
      if (request.method() === 'GET') return disruption.current ? reply(disruption.current)
        : route.fulfill({ status: 200, headers: cors, json: { code: 200, message: 'Fixture' } });
      if (url.pathname.endsWith('/resume')) {
        disruption.current = { ...disruption.current, state: 'RESUMING', checkinReady: false };
        return disruption.loseResume ? reply(null, 503) : reply(disruption.current);
      }
      const command = request.postDataJSON();
      disruption.commands.push(command);
      if (disruption.loseFirst && disruption.commands.length === 1) return reply(null, 503);
      const state = command.kind === 'CANCEL' ? 'PAUSING' : 'PAUSED';
      disruption.current = { id: command.actionId, kind: command.kind, state, reason: command.reason,
        eventDate: command.eventDate ?? null, ticketingReady: true, checkinReady: state === 'PAUSED', processed: state === 'PAUSED' };
      return reply(disruption.current);
    }
    if (refund && request.method() === 'POST' && url.pathname.endsWith('/refunds')) {
      const command = request.postDataJSON();
      refund.commands.push(command);
      if (refund.conflictAction === command.action) return reply(null, 409);
      const count = refund.commands.filter((item) => item.action === command.action).length;
      const next = { id: 'refund-001', orderId: first.id, amount: 250000, requestedBy: requesterId,
        approvedBy: null, provider: 'VNPAY', transactionId: 'vnp-9034', externalReference: null,
        occurredAt: null, compensation: false, ...refund.case };
      if (command.action === 'REQUEST') next.state = 'REQUESTED';
      if (command.action === 'APPROVE') {
        next.state = count < 3 ? 'HOLD_PENDING' : 'APPROVED';
        next.approvedBy = actor;
      }
      if (command.action === 'CONFIRM') {
        next.state = 'RESOLVED_MANUALLY';
        next.externalReference = command.externalReference;
        next.occurredAt = command.occurredAt;
      }
      if (command.action === 'ABORT') next.state = 'ABORTED';
      refund.case = next;
      if (refund.loseFirst.has(command.action) && count === 1) {
        return command.action === 'CONFIRM' ? reply(null, 503) : route.abort('failed');
      }
      return reply(next);
    }
    if (url.pathname === '/api/admin/orders/support/queue') {
      const { kind, page, size } = Object.fromEntries(url.searchParams);
      queueState.requests.push({ kind, page, size });
      if (queueState.loadUnavailable) return reply(null, 503);
      const row = { orderId: first.id, sourceId: second.id, state: 'REVIEW_REQUIRED',
        updatedAt: '2026-11-12T00:06:00Z', retryable: true };
      if (kind === 'FAILED_EMAIL') row.state = 'FAILED';
      if (kind === 'PENDING_REFUND') row.state = 'RECONCILIATION_REQUIRED';
      const content = queueState.completed.has(kind) || kind === 'MISSING_TICKETS' ? [] : [row];
      const totalElements = content.length ? (kind === 'UNKNOWN_PAYMENT' ? 11 : 1) : 0;
      return reply({ content, page: Number(page), size: Number(size), totalElements, totalPages: Math.ceil(totalElements / 10) });
    }
    if (request.method() === 'POST' && (url.pathname.endsWith('/review') || url.pathname.endsWith('/retry'))) {
      const kind = url.pathname.endsWith('/review') ? 'UNKNOWN_PAYMENT' : 'FAILED_EMAIL';
      queueState.actions.push({ kind, path: url.pathname, body: request.postDataJSON(),
        key: request.headers()['idempotency-key'] });
      if (queueState.actions.filter((action) => action.kind === kind).length === 1) return route.abort('failed');
      queueState.completed.add(kind);
      return reply({});
    }
    const detail = url.pathname.match(/\/orders\/([^/]+)\/support\/(tickets|payment|delivery)$/);
    if (detail) {
      const [, orderId, section] = detail;
      state.sections.push({ orderId, section, scope: request.headers()['x-organization-id'] });
      if (section === 'tickets') {
        return reply([{ id: 'ticket-001', status: 'VALID', issuedAt: '2026-11-12T00:04:00Z' }]);
      }
      if (section === 'payment') {
        if (refund) return reply({ attempt: { state: 'SUCCEEDED', provider: 'VNPAY', transactionId: 'vnp-9034',
          requestedAmount: 250000, verifiedAt: new Date(Date.now() - 3_600_000).toISOString() },
        cases: refund.case ? [refund.case] : [] });
        return reply({ attempt: { state: 'SUCCEEDED', provider: 'VNPAY', transactionId: 'vnp-9034', verifiedAt: '2026-11-12T00:03:00Z' },
          cases: [{ id: 'review-001', state: 'REVIEW_REQUIRED', amount: 250000, externalReference: null, recordedAt: null }] });
      }
      return state.deliveryUnavailable ? reply(null, 503)
        : reply([{ id: 'email-001', status: 'SENT', updatedAt: '2026-11-12T00:06:00Z' }]);
    }
    if (url.pathname.endsWith('/orders/support')) {
      const scope = request.headers()['x-organization-id'];
      state.searches.push({ path: url.pathname, query: Object.fromEntries(url.searchParams), scope });
      if (state.errorStatus) return reply(null, state.errorStatus);
      const index = Number(url.searchParams.get('page'));
      const content = url.searchParams.get('transactionRef') === 'absent' ? []
        : scope === 'org-b' || index === 1 ? [second] : [first];
      const totalElements = content.length && (scope ? 1 : 21);
      return reply({ content, page: index, size: 20, totalElements, totalPages: Math.ceil(totalElements / 20) });
    }
    if (url.pathname.endsWith('/orders')) return reply([legacy]);
    if (url.pathname.endsWith('/concerts')) return reply({ content: [{ id: concertId, title: 'Buổi diễn đã chọn' }] });
    return reply([]);
  });
  return { page, state, queueState, close: () => context.close() };
}

async function search(page, kind, value, submitByKeyboard = false) {
  const form = page.getByRole('search', { name: 'Tra cứu đơn hàng' });
  await form.getByLabel('Tìm theo').selectOption(kind);
  const input = form.getByRole('textbox');
  await input.fill(value);
  if (submitByKeyboard) await input.press('Enter');
  else await form.getByRole('button', { name: 'Tra cứu', exact: true }).click();
}

try {
  const admin = await fixture('ADMIN');
  await admin.page.goto(`${origin}/admin/orders?concertId=${concertId}`);
  await admin.page.getByText(legacy.concertTitle).waitFor();
  await search(admin.page, 'buyerEmail', 'buyer@test.invalid', true);
  await admin.page.getByText(first.concertTitle, { exact: true }).waitFor();
  assert.deepEqual(admin.state.searches[0], { path: '/api/admin/orders/support',
    query: { buyerEmail: 'buyer@test.invalid', concertId, page: '0', size: '20' }, scope: undefined });
  await admin.page.getByRole('button', { name: 'Trang sau' }).click();
  await admin.page.getByText(second.concertTitle, { exact: true }).waitFor();
  assert.equal(admin.state.searches.at(-1).query.page, '1');
  assert(await admin.page.getByRole('button', { name: 'Trang sau' }).evaluate((button) => button === document.activeElement));
  for (const width of [1440, 768, 390]) {
    await admin.page.setViewportSize({ width, height: 850 });
    await admin.page.evaluate(() => window.scrollTo(0, 0));
    assert(await admin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    const searchField = admin.page.getByRole('search', { name: 'Tra cứu đơn hàng' }).locator('label');
    assert((await searchField.boundingBox()).height <= 56, `Search field is too tall at ${width}px`);
    await mkdir(output, { recursive: true });
    await admin.page.screenshot({ path: resolve(output, `search-${width}.png`), animations: 'disabled' });
  }
  admin.state.deliveryUnavailable = true;
  await admin.page.getByRole('button', { name: 'Chi tiết', exact: true }).click();
  await admin.page.getByRole('heading', { name: second.concertTitle }).waitFor();
  await admin.page.getByText(second.id, { exact: true }).waitFor();
  checks.push('Admin exact email search preserves concert scope, pages results and opens the existing detail');
  await admin.page.getByRole('region', { name: 'Vé đã phát hành' }).getByText('ticket-001', { exact: true }).waitFor();
  const payment = admin.page.getByRole('region', { name: 'Thanh toán và ngoại lệ' });
  await payment.getByText('vnp-9034', { exact: true }).waitFor();
  await payment.getByText('review-001', { exact: true }).waitFor();
  const delivery = admin.page.getByRole('region', { name: 'Gửi email' });
  await delivery.getByRole('alert').waitFor();
  admin.state.deliveryUnavailable = false;
  await delivery.getByRole('button', { name: 'Thử lại', exact: true }).click();
  await delivery.getByText('Đã gửi', { exact: true }).waitFor();
  assert.deepEqual(admin.state.sections.map(({ section }) => section).sort(), ['delivery', 'delivery', 'payment', 'tickets']);
  assert(admin.state.sections.every(({ orderId }) => orderId === second.id));
  await admin.page.screenshot({ path: resolve(output, 'detail-390.png'), animations: 'disabled' });
  await admin.page.getByRole('button', { name: 'Đóng' }).click();
  checks.push('Order detail keeps independent sections available and retries only the unavailable delivery section');

  admin.state.errorStatus = 503;
  await search(admin.page, 'transactionRef', 'absent');
  await admin.page.getByRole('alert').waitFor();
  assert.equal(await admin.page.getByText(second.concertTitle, { exact: true }).count(), 0);
  admin.state.errorStatus = 0;
  await admin.page.getByRole('button', { name: 'Làm mới' }).click();
  await admin.page.getByText('Không tìm thấy đơn hàng phù hợp.').waitFor();
  await admin.page.getByRole('button', { name: 'Xóa tra cứu' }).click();
  await admin.page.getByText(legacy.concertTitle).waitFor();
  await admin.close();
  checks.push('Unavailable search retains criteria for retry, clears stale results, and can return to the existing list');

  const organizer = await fixture('ORGANIZER');
  await organizer.page.goto(`${origin}/organizer/orders`);
  await search(organizer.page, 'orderId', first.id);
  await organizer.page.getByText(first.concertTitle, { exact: true }).waitFor();
  assert.equal(organizer.state.searches.at(-1).scope, 'org-a');
  await organizer.page.getByLabel('Tổ chức đang làm việc').selectOption('org-b');
  await organizer.page.goto(`${origin}/organizer/orders`);
  await search(organizer.page, 'orderId', second.id);
  await organizer.page.getByText(second.concertTitle, { exact: true }).waitFor();
  assert.deepEqual(organizer.state.searches.at(-1), { path: '/api/organizer/manage/orders/support',
    query: { orderId: second.id, page: '0', size: '20' }, scope: 'org-b' });
  assert.equal(await organizer.page.getByText(first.concertTitle, { exact: true }).count(), 0);
  organizer.state.errorStatus = 403;
  await organizer.page.getByRole('button', { name: 'Làm mới' }).click();
  await organizer.page.getByRole('alert').getByText('Bạn không còn quyền xem đơn hàng trong phạm vi này.').waitFor();
  assert.equal(await organizer.page.getByText(second.concertTitle, { exact: true }).count(), 0);
  await organizer.close();
  checks.push('Organizer search uses the selected organization header and clears prior results on switch or revoked access');

  const operator = await fixture('ADMIN');
  operator.queueState.loadUnavailable = true;
  await operator.page.goto(`${origin}/admin`);
  const queue = operator.page.getByRole('region', { name: 'Việc cần xử lý' });
  await queue.getByRole('alert').waitFor();
  assert.deepEqual(operator.queueState.requests[0], { kind: 'UNKNOWN_PAYMENT', page: '0', size: '10' });
  operator.queueState.loadUnavailable = false;
  await queue.getByRole('button', { name: 'Tải lại danh sách' }).press('Enter');
  await queue.getByRole('link', { name: first.id }).waitFor();
  await queue.getByRole('button', { name: 'Trang sau' }).click();
  await queue.getByText('Trang 2 / 2', { exact: true }).waitFor();
  assert.equal(operator.queueState.requests.at(-1).page, '1');
  checks.push('Exception queue loads only the chosen category and supports independent retry and pagination');

  for (const [kind, label] of [['UNKNOWN_PAYMENT', 'Kiểm tra lại giao dịch'], ['FAILED_EMAIL', 'Gửi lại email']]) {
    await queue.getByLabel('Loại ngoại lệ').selectOption(kind);
    await queue.getByRole('button', { name: label }).click();
    await queue.getByRole('alert').waitFor();
    await queue.getByRole('button', { name: label }).click();
    await queue.getByText('Không có trường hợp cần xử lý.', { exact: true }).waitFor();
    const [firstAction, secondAction] = operator.queueState.actions.filter((action) => action.kind === kind);
    assert.deepEqual(firstAction, secondAction);
    assert.match(firstAction.body?.actionId ?? firstAction.key, /^[0-9a-f-]{36}$/i);
    if (kind === 'UNKNOWN_PAYMENT') {
      assert.equal(firstAction.path, `/api/admin/payment-workflows/${first.id}/review`);
      assert.equal(firstAction.body.action, 'REDRIVE_QUERY');
    } else {
      assert.equal(firstAction.path, `/api/admin/notifications/${second.id}/retry`);
    }
  }
  checks.push('Payment and email actions keep the same identity when the first response is lost');

  await queue.getByLabel('Loại ngoại lệ').selectOption('PENDING_REFUND');
  await queue.getByRole('link', { name: first.id }).waitFor();
  assert.equal(await queue.getByRole('button', { name: /Gửi lại|Kiểm tra lại/ }).count(), 0);
  for (const width of [1440, 768, 390]) {
    await operator.page.setViewportSize({ width, height: 850 });
    assert(await operator.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await operator.page.evaluate(() => window.scrollTo(0, 0));
    await operator.page.screenshot({ path: resolve(output, `exception-queue-${width}.png`), animations: 'disabled' });
  }
  await queue.getByRole('link', { name: first.id }).click();
  await operator.page.getByText(first.concertTitle, { exact: true }).waitFor();
  assert.deepEqual(operator.state.searches.at(-1)?.query, { orderId: first.id, page: '0', size: '20' });
  await operator.close();
  checks.push('Refund exceptions are read-only and the order link opens an exact prefilled search at all viewport sizes');

  async function openRefundPayment(fixture, scope = 'admin') {
    await fixture.page.goto(`${origin}/${scope}/orders`);
    await fixture.page.getByRole('button', { name: 'Chi tiết', exact: true }).click();
    const payment = fixture.page.getByRole('region', { name: 'Thanh toán và ngoại lệ' });
    await payment.getByText('vnp-9034', { exact: true }).waitFor();
    return payment;
  }

  const refund = { case: null, commands: [], loseFirst: new Set(['APPROVE', 'CONFIRM']) };
  const requestAdmin = await fixture('ADMIN', { refund });
  const requestPayment = await openRefundPayment(requestAdmin);
  await requestPayment.getByRole('button', { name: 'Yêu cầu hoàn toàn đơn' }).click();
  await requestPayment.getByLabel('Lý do').fill('Khách yêu cầu hoàn toàn đơn');
  await requestPayment.getByRole('button', { name: 'Gửi yêu cầu hoàn tiền' }).click();
  await requestPayment.getByText('Chờ admin khác duyệt.', { exact: true }).waitFor();
  assert.equal(await requestPayment.getByRole('button', { name: 'Duyệt yêu cầu' }).count(), 0);
  assert.equal(await requestPayment.getByText(/trên cổng thanh toán/).count(), 0);
  await requestAdmin.close();

  const finance = await fixture('ORGANIZER', { refund });
  const financePayment = await openRefundPayment(finance, 'organizer');
  await financePayment.getByText('Chờ duyệt', { exact: true }).waitFor();
  assert.equal(await financePayment.getByRole('button', { name: /hoàn tiền|duyệt/i }).count(), 0);
  await finance.close();
  checks.push('Refund request keeps the requester and organizer from approving or seeing merchant instructions');

  const approveAdmin = await fixture('ADMIN', { actor: approverId, refund });
  const approvePayment = await openRefundPayment(approveAdmin);
  await approvePayment.getByRole('button', { name: 'Duyệt yêu cầu' }).click();
  await approvePayment.getByLabel('Lý do').fill('Kiểm tra vé trước khi duyệt');
  await approvePayment.getByRole('button', { name: 'Xác nhận duyệt' }).click();
  await approvePayment.getByRole('alert').waitFor();
  await approvePayment.getByRole('button', { name: 'Xác nhận duyệt' }).click();
  await approvePayment.getByText('Đang chờ xác nhận giữ vé. Có thể kiểm tra lại.', { exact: true }).waitFor();
  assert.equal(await approvePayment.getByText(/trên cổng thanh toán/).count(), 0);
  await approvePayment.getByRole('button', { name: 'Xác nhận duyệt' }).click();
  await approvePayment.getByText(/thực hiện hoàn toàn đơn trên cổng thanh toán/i).waitFor();
  const approvalCommands = refund.commands.filter((command) => command.action === 'APPROVE');
  assert.equal(approvalCommands.length, 3);
  assert.deepEqual(approvalCommands[1], approvalCommands[0]);
  assert.deepEqual(approvalCommands[2], approvalCommands[0]);
  await approvePayment.getByRole('button', { name: 'Ghi nhận kết quả hoàn tiền' }).click();
  await approvePayment.getByLabel('Lý do').fill('Cổng xác nhận đã hoàn đủ');
  await approvePayment.getByLabel('Mã tham chiếu hoàn tiền').fill('VNP-REFUND-123');
  const timeInput = new Date(Date.now() + (7 * 60 - 2) * 60_000).toISOString().slice(0, 16);
  await approvePayment.getByLabel('Thời điểm hoàn tiền', { exact: false }).fill(timeInput);
  for (const width of [1440, 768, 390]) {
    await approveAdmin.page.setViewportSize({ width, height: 850 });
    assert(await approveAdmin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await approvePayment.locator('form').screenshot({ path: resolve(output, `refund-confirm-${width}.png`), animations: 'disabled' });
  }
  await approvePayment.getByRole('button', { name: 'Xác nhận đã hoàn tiền' }).click();
  await approvePayment.getByRole('alert').waitFor();
  assert.equal(await approvePayment.getByLabel('Mã tham chiếu hoàn tiền').getAttribute('readonly'), '');
  await approvePayment.getByRole('button', { name: 'Xác nhận đã hoàn tiền' }).click();
  await approvePayment.getByText('VNP-REFUND-123', { exact: true }).waitFor();
  const confirmations = refund.commands.filter((command) => command.action === 'CONFIRM');
  assert.deepEqual(confirmations[1], confirmations[0]);
  assert.equal(confirmations[0].amount, 250000);
  assert.equal(confirmations[0].occurredAt, `${timeInput}:00+07:00`);
  await approveAdmin.close();
  checks.push('Approval waits for Check-in and confirmation sends the same full amount, reference and local time on replay');

  const abortRefund = { case: { ...refund.case, state: 'APPROVED', externalReference: null, occurredAt: null },
    commands: [], loseFirst: new Set(), conflictAction: 'ABORT' };
  const abortAdmin = await fixture('ADMIN', { actor: approverId, refund: abortRefund });
  const abortPayment = await openRefundPayment(abortAdmin);
  await abortPayment.getByRole('button', { name: 'Đóng hồ sơ chưa hoàn tiền' }).click();
  await abortPayment.getByLabel('Lý do').fill('Đã xác minh giao dịch hoàn chưa được gửi');
  const abortButton = abortPayment.getByRole('button', { name: 'Xác nhận đóng hồ sơ' });
  assert(await abortButton.isDisabled());
  await abortPayment.getByLabel('Tôi xác nhận chưa gửi khoản hoàn tiền.').check();
  await abortButton.click();
  await abortPayment.getByRole('alert').getByText(/tải lại hồ sơ/).waitFor();
  assert(await abortButton.isDisabled());
  abortRefund.conflictAction = null;
  await abortPayment.getByRole('button', { name: 'Tải lại trạng thái' }).click();
  await abortPayment.getByRole('button', { name: 'Đóng hồ sơ chưa hoàn tiền' }).click();
  await abortPayment.getByLabel('Lý do').fill('Đã xác minh giao dịch hoàn chưa được gửi');
  await abortPayment.getByLabel('Tôi xác nhận chưa gửi khoản hoàn tiền.').check();
  await abortButton.click();
  await abortPayment.getByText('Đã đóng hồ sơ.', { exact: true }).waitFor();
  assert.deepEqual(abortRefund.commands.map((command) => command.action), ['ABORT', 'ABORT']);
  await abortAdmin.close();
  checks.push('Closing a refund case requires explicit no-money-sent confirmation and a conflict reload');

  const disruption = { current: null, commands: [], requests: [], loseFirst: true };
  const eventAdmin = await fixture('ADMIN', { disruption });
  await eventAdmin.page.goto(`${origin}/admin/concerts/${concertId}?tab=operations`);
  const panel = eventAdmin.page.getByRole('region', { name: 'Hoãn hoặc hủy buổi diễn' });
  await panel.getByRole('link', { name: first.id }).waitFor();
  await panel.getByRole('button', { name: 'Trang sau' }).click();
  await panel.getByRole('link', { name: second.id }).waitFor();
  assert(disruption.requests.some((path) => path.endsWith('/impact?page=1&size=10')));
  await panel.getByLabel('Quyết định').selectOption('CANCEL');
  await panel.getByLabel('Lý do').fill('Hội trường không thể mở cửa');
  const cancel = panel.getByRole('button', { name: 'Xác nhận hủy' });
  assert(await cancel.isDisabled());
  await panel.getByRole('checkbox').check();
  await cancel.click();
  await panel.getByRole('alert').getByText(/thử lại/).waitFor();
  await cancel.click();
  await panel.getByText('Ticketing đã xác nhận', { exact: true }).waitFor();
  await panel.getByText('Đang chờ Check-in xác nhận', { exact: true }).waitFor();
  assert.deepEqual(disruption.commands[0], disruption.commands[1]);
  assert.equal(await panel.getByRole('button', { name: 'Mở lại bán vé và check-in' }).count(), 0);
  await eventAdmin.close();
  checks.push('Cancellation requires paged impact preview and confirmation and replays the same action while acknowledgments remain separate');

  const postponed = { current: null, commands: [], requests: [], loseResume: true };
  const postponeAdmin = await fixture('ADMIN', { disruption: postponed });
  await postponeAdmin.page.goto(`${origin}/admin/concerts/${concertId}?tab=operations`);
  const postponement = postponeAdmin.page.getByRole('region', { name: 'Hoãn hoặc hủy buổi diễn' });
  await postponement.getByRole('link', { name: first.id }).waitFor();
  await postponement.getByLabel('Quyết định').selectOption('POSTPONE');
  await postponement.getByLabel('Lý do').fill('Dời lịch do thời tiết');
  const newDate = new Date(Date.now() + 172_800_000).toISOString().slice(0, 16);
  const saleStart = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
  await postponement.getByLabel('Thời điểm diễn mới').fill(newDate);
  await postponement.getByLabel('Mở bán lại từ').fill(saleStart);
  await postponement.getByRole('checkbox').check();
  for (const width of [1440, 768, 390]) {
    await postponeAdmin.page.setViewportSize({ width, height: 850 });
    assert(await postponeAdmin.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1));
    await postponement.screenshot({ path: resolve(output, `event-disruption-${width}.png`), animations: 'disabled' });
  }
  await postponement.getByRole('button', { name: 'Xác nhận hoãn' }).click();
  const resume = postponement.getByRole('button', { name: 'Mở lại bán vé và check-in' });
  await resume.waitFor();
  assert.equal(postponed.commands[0].eventDate, `${newDate}:00+07:00`);
  assert.equal(postponed.commands[0].saleStartAt, `${saleStart}:00+07:00`);
  await resume.click();
  await postponement.getByText('Đang mở lại', { exact: true }).waitFor();
  assert.equal(await postponement.getByRole('alert').count(), 0);
  assert(postponed.requests.some((path) => path.endsWith(`/${postponed.commands[0].actionId}/resume`)));
  postponed.current = { ...postponed.current, state: 'RESUMED', checkinReady: true };
  await postponement.getByText('Đã mở lại', { exact: true }).waitFor();
  await postponeAdmin.close();

  const organizerDisruption = { current: null, commands: [], requests: [] };
  const eventOrganizer = await fixture('ORGANIZER', { disruption: organizerDisruption });
  await eventOrganizer.page.goto(`${origin}/organizer/concerts/${concertId}?tab=operations`);
  await eventOrganizer.page.getByRole('heading', { name: 'Vận hành tại cổng' }).waitFor();
  assert.equal(await eventOrganizer.page.getByRole('region', { name: 'Hoãn hoặc hủy buổi diễn' }).count(), 0);
  assert.deepEqual(organizerDisruption.requests, []);
  await eventOrganizer.close();
  checks.push('Postponement sends the revised Vietnam schedule and resumes only from paused state, with admin-only controls');
} finally {
  await mkdir(output, { recursive: true });
  await writeFile(resolve(output, 'results.json'), JSON.stringify({ passed: checks.length === 12, checks }, null, 2));
  await browser.close();
  server.close();
}
