import assert from 'node:assert/strict';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { scannerFixture, scannerOrganizationId } from './scanner-fixture.mjs';

const baseURL = process.env.TICKETBOX_SCANNER_URL ?? 'http://localhost:8092';
const viewport = { width: Number(process.env.TICKETBOX_SCANNER_WIDTH ?? '360'), height: 640 };
const captureDir = process.env.TICKETBOX_SCANNER_CAPTURE_DIR;
const cameraVideo = process.env.TICKETBOX_SCANNER_CAMERA_VIDEO;
const qrDecoder = process.env.TICKETBOX_SCANNER_QR_DECODER;
const browser = await chromium.launch({
  args: cameraVideo ? [
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    `--use-file-for-fake-video-capture=${cameraVideo}`,
  ] : [],
});
try {
  const page = await browser.newPage({ baseURL, viewport, reducedMotion: 'reduce' });
  page.setDefaultTimeout(10000);
  if (captureDir) await mkdir(captureDir, { recursive: true });
  async function capture(name) {
    if (captureDir) await page.screenshot({ path: join(captureDir, `${name}.png`) });
  }
  if (cameraVideo && qrDecoder) {
    await page.route('https://cdn.jsdelivr.net/npm/jsqr@1.2.0/dist/jsQR.min.js', (route) =>
      route.fulfill({ path: qrDecoder, contentType: 'application/javascript' }));
  }
  let syncResponse = 'normal';
  let historyUnavailable = false;
  let submitted = 0;
  let releaseLateScan;
  let signalLateScan;
  const lateScanStarted = new Promise((resolve) => { signalLateScan = resolve; });
  const lateScanReleased = new Promise((resolve) => { releaseLateScan = resolve; });
  const fixture = scannerFixture();
  await page.route('**/api/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const payload = request.postDataJSON() ?? {};
    if (url.pathname.startsWith('/api/v2/staff/')) {
      assert.equal(request.headers()['x-organization-id'], scannerOrganizationId);
    }
    if (url.pathname.endsWith('/scan')) {
      submitted += 1;
      if (payload.qrCode === 'TB-LATE') {
        signalLateScan();
        await lateScanReleased;
        return route.fulfill({ json: {
          success: true, message: 'OK', data: {
            status: 'SUCCESS', concertId: url.pathname.split('/').at(-2), ticketId: null,
            message: 'Phản hồi từ sự kiện trước', checkAt: new Date().toISOString(),
          },
        } });
      }
    }
    if (url.pathname.endsWith('/sync') && syncResponse !== 'normal') {
      if (syncResponse === 'offline') return route.abort('connectionrefused');
      return route.fulfill({ status: 403, json: { success: false, message: 'Không có quyền' } });
    }
    if (url.pathname.endsWith('/checkins') && historyUnavailable) return route.abort('connectionrefused');
    const result = fixture(url, payload, request.headers());
    if (!result) return route.abort('connectionrefused');
    await route.fulfill(result);
  });
  await page.goto('/');
  await page.getByPlaceholder('staff@example.com').fill('scanner@example.test');
  await page.getByPlaceholder('Mật khẩu', { exact: true }).fill('fixture-password');
  await page.getByText('Đăng nhập', { exact: true }).click();
  await page.getByText('Đêm nhạc Sài Gòn', { exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu quét' }).click();
  await page.getByText('Nhập cổng đang làm việc trước khi quét.', { exact: true }).waitFor();
  assert.equal(submitted, 0);
  await page.getByPlaceholder('A, B, VIP...').fill('A');
  await page.getByRole('button', { name: 'Tải dữ liệu vé', exact: true }).click();
  await page.getByRole('button', { name: 'Cập nhật dữ liệu vé', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByText('Danh sách vé', { exact: true }).click();
  await page.getByText('Mã vé VE-10000000', { exact: true }).waitFor();
  await page.getByText('Loại vé Tiêu chuẩn', { exact: true }).waitFor();
  await page.getByText('Vé chưa có mã tra cứu', { exact: true }).waitFor();
  assert.equal(await page.getByText(/b0000000-0000-4000/).count(), 0);
  assert.equal(await page.getByText(/a0000000-0000-4000/).count(), 0);
  await page.getByRole('textbox', { name: 'Tìm trong danh sách vé' }).fill('ve-10000001');
  await page.getByText('Mã vé VE-10000001', { exact: true }).waitFor();
  assert.equal(await page.getByText('Mã vé VE-10000000', { exact: true }).count(), 0);
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByText('Tổng quan và cổng', { exact: true }).click();
  await page.getByRole('button', { name: 'Bắt đầu quét' }).click();
  if (cameraVideo) {
    const permission = page.getByRole('button', { name: 'Cho phép camera' });
    await permission.click();
    await page.getByText('Căn mã QR vào khung', { exact: true }).waitFor();
    await page.getByText('Cho phép vào cổng', { exact: true }).waitFor();
    await capture('camera');
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('button', { name: 'Đóng menu' }).waitFor();
    const duringDrawer = submitted;
    await page.waitForFunction(
      () => !document.querySelector('video') && Boolean(document.querySelector('[role="dialog"]')),
    );
    assert.equal(submitted, duringDrawer);
    assert.equal(submitted, 1);
    console.log('Chromium camera fixture decoded the QR once and released the camera when opening the drawer');
  } else {
    await page.getByRole('button', { name: 'Mở menu' }).click({ timeout: 6000 });
    await page.getByRole('button', { name: 'Đóng menu', exact: true }).waitFor();
    await capture('drawer');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Đóng menu', exact: true }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Mở menu' }).focus();
    await page.keyboard.press('Enter');
    await page.getByRole('button', { name: 'Đóng menu', exact: true }).click();
    await page.getByRole('button', { name: 'Nhập mã thủ công' }).click();
    const entry = page.getByRole('textbox', { name: 'Nội dung mã QR' });
    async function submit(value, label) {
      await entry.fill(value);
      await page.getByRole('button', { name: 'Soát vé', exact: true }).click();
      await page.getByText(label, { exact: true }).first().waitFor();
    }
    await submit('TB-UNKNOWN', 'Vé không được chấp nhận');
    assert.equal(await entry.inputValue(), 'TB-UNKNOWN');
    await submit('VE-10000000', 'Vé không được chấp nhận');
    await submit('TB-DENIED', 'Không có quyền soát vé');
    await submit('TB-EXPIRED', 'Phiên đăng nhập hết hạn');
    await submit('TB-PENDING', 'Chờ xác nhận');
    await capture('pending');
    assert.equal(await page.getByText('Cho phép vào cổng', { exact: true }).count(), 0);
    await submit('TB-CONFLICT', 'Chờ xác nhận');
    await submit('TB-CONFLICT', 'Mã đã quét trên thiết bị');
    // Simulate the device's offline signal while leaving the fixture endpoint reachable.
    await page.evaluate(() => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, value: false });
      window.dispatchEvent(new Event('offline'));
    });
    await submit('TB-ACCEPTED', 'Cho phép vào cổng');
    syncResponse = 'forbidden';
    await page.evaluate(() => {
      Reflect.deleteProperty(navigator, 'onLine');
      window.dispatchEvent(new Event('online'));
    });
    historyUnavailable = true;
    await page.getByRole('button', { name: 'Xem tất cả' }).click();
    await page.getByRole('button', { name: 'Tải lại lịch sử' }).waitFor();
    assert.match(await page.getByText(/Thiết bị và|Dữ liệu trên thiết bị/).first().textContent(), /[Tt]hiết bị/);
    historyUnavailable = false;
    await page.getByRole('button', { name: 'Tải lại lịch sử' }).click();
    await page.getByRole('button', { name: 'Tải lại lịch sử' }).waitFor({ state: 'hidden' });
    await page.getByRole('button', { name: 'Đang chờ', exact: true }).click();
    await page.getByText('2 lượt chờ xác nhận', { exact: true }).waitFor();
    for (const failure of ['forbidden', 'offline']) {
      syncResponse = failure;
      await page.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click();
      await page.getByText(failure === 'forbidden' ? /Không có quyền thực hiện thao tác này/ : /Không kết nối được với Check-in/).waitFor();
      assert.equal(await page.getByText('2 lượt chờ xác nhận', { exact: true }).count(), 1);
    }
    syncResponse = 'normal';
    await page.getByRole('button', { name: 'Đồng bộ ngay', exact: true }).click();
    await page.getByText('Không có lượt nào khớp', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Đã xác nhận', exact: true }).click();
    assert.equal(await page.getByText('Đã xác nhận', { exact: true }).count(), 3);
    await page.getByRole('textbox', { name: 'Tìm trong lịch sử' }).fill('ve-10000000');
    await page.getByText('Mã vé VE-10000000', { exact: true }).waitFor();
    await page.getByText('Loại vé Tiêu chuẩn', { exact: true }).waitFor();
    assert.equal(await page.getByText('Mã vé VE-10000001', { exact: true }).count(), 0);
    await page.getByRole('textbox', { name: 'Tìm trong lịch sử' }).clear();
    await page.getByRole('button', { name: 'Lỗi', exact: true }).click();
    await page.getByText('Xung đột đồng bộ', { exact: true }).waitFor();
    await capture('history');
    await page.getByRole('textbox', { name: 'Tìm trong lịch sử' }).fill('unknown');
    await page.getByText('Không có lượt nào khớp', { exact: true }).waitFor();
    await page.getByRole('tab', { name: 'Quét vé' }).click();
    await page.getByRole('button', { name: 'Nhập mã thủ công' }).click();
    await entry.fill('TB-LATE');
    const before = submitted;
    await page.getByRole('button', { name: 'Soát vé', exact: true }).evaluate((button) => {
      button.click();
      button.click();
    });
    await lateScanStarted;
    assert.equal(submitted, before + 1);
    await page.getByText('Đang kiểm tra vé…', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Mở menu' }).click();
    await page.getByRole('button', { name: 'Đổi sự kiện' }).click();
    await page.getByText('Hoà nhạc Hà Nội', { exact: true }).click();
    assert.equal(await page.getByPlaceholder('A, B, VIP...').inputValue(), '');
    releaseLateScan();
    await page.getByPlaceholder('A, B, VIP...').fill('B');
    await page.getByRole('button', { name: 'Bắt đầu quét' }).click();
    await page.getByRole('button', { name: 'Nhập mã thủ công' }).click();
    assert.equal(await page.getByText('Phản hồi từ sự kiện trước', { exact: true }).count(), 0);
    await submit('TB-PENDING', 'Mã không có trong dữ liệu đã tải');
    await page.getByRole('tab', { name: 'Lịch sử' }).click();
    await page.getByText('0 lượt chờ xác nhận', { exact: true }).waitFor();
    console.log(`Scanner flow passed at ${viewport.width}×${viewport.height}`);
  }
} finally {
  await browser.close();
}
