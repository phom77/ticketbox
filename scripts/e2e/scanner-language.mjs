import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import { scannerFixture, scannerOrganizationId } from './scanner-fixture.mjs';

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    baseURL: process.env.TICKETBOX_SCANNER_URL ?? 'http://localhost:8092',
    locale: 'vi-VN',
    viewport: { width: 320, height: 640 },
  });
  page.setDefaultTimeout(7000);
  const fixture = scannerFixture();
  let scanLanguage;
  let syncLanguage;
  await page.route('**/api/**', (route) => {
    const request = route.request();
    if (request.url().endsWith('/scan')) scanLanguage = request.headers()['accept-language'];
    if (request.url().endsWith('/sync')) syncLanguage = request.headers()['accept-language'];
    if (new URL(request.url()).pathname.startsWith('/api/v2/staff/')) {
      assert.equal(request.headers()['x-organization-id'], scannerOrganizationId);
    }
    const result = fixture(new URL(request.url()), request.postDataJSON() ?? {}, request.headers());
    return result ? route.fulfill(result) : route.abort('connectionrefused');
  });
  await page.goto('/');
  const email = page.getByRole('textbox', { name: 'Email' });
  await email.fill('scanner@example.test');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await page.getByText('Nhập email và mật khẩu STAFF.', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByText('Staff sign-in', { exact: true }).waitFor();
  assert.equal(await email.inputValue(), 'scanner@example.test');
  await page.getByText('Enter the email and password for your staff account.', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('Staff sign-in', { exact: true }).waitFor();
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  await email.fill('scanner@example.test');
  await page.getByPlaceholder('Password').fill('fixture-password');
  await page.getByRole('button', { name: 'Sign in', exact: true }).click();
  await page.getByText('Đêm nhạc Sài Gòn', { exact: true }).click();
  await page.getByPlaceholder('A, B, VIP...').fill('A');
  await page.getByRole('button', { name: 'Download ticket data', exact: true }).click();
  await page.getByRole('button', { name: 'Update ticket data', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Start scanning' }).click();
  await page.getByRole('button', { name: 'Enter code manually' }).click();
  await page.getByRole('textbox', { name: 'Ticket or QR code' }).fill('TB-PENDING');
  await page.getByRole('button', { name: 'Check ticket', exact: true }).click();
  await page.getByText('Saved on this device. Wait for Check-in to confirm before admitting the guest.', { exact: true }).waitFor();
  assert.equal(scanLanguage, 'en');
  await page.getByRole('button', { name: 'Open menu' }).click();
  await page.getByRole('button', { name: 'Tiếng Việt', exact: true }).click();
  await page.getByRole('button', { name: 'Đóng menu', exact: true }).click();
  await page.getByText('Đã lưu trên thiết bị. Đợi Check-in xác nhận trước khi cho khách vào.', { exact: true }).waitFor();
  await page.getByRole('tab', { name: 'Lịch sử' }).click();
  await page.getByText('1 lượt chờ xác nhận', { exact: true }).first().waitFor();
  await page.getByRole('button', { name: 'Đồng bộ ngay' }).click();
  await page.getByText('0 lượt chờ xác nhận', { exact: true }).first().waitFor();
  assert.equal(syncLanguage, 'vi');
  await page.getByRole('button', { name: 'Mở menu' }).click();
  await page.getByRole('button', { name: 'English', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await page.getByText('Staff sign-in', { exact: true }).waitFor();
  await page.reload();
  await page.getByText('Staff sign-in', { exact: true }).waitFor();
  await page.evaluate(() => localStorage.setItem('ticketbox.language', 'unsupported'));
  await page.reload();
  await page.getByText('Đăng nhập nhân viên', { exact: true }).waitFor();
  console.log('Scanner language switch, persistence, pending state and request locale passed');
} finally {
  await browser.close();
}
