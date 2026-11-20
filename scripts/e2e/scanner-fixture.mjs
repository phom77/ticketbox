import { createServer } from 'node:http';
import { pathToFileURL } from 'node:url';

const firstId = 'a0000000-0000-4000-8000-000000000001';
const secondId = 'a0000000-0000-4000-8000-000000000002';
export const scannerOrganizationId = 'c0000000-0000-4000-8000-000000000001';
const now = '2026-11-14T12:42:00Z';
const code = { accepted: 'TB-ACCEPTED', pending: 'TB-PENDING', conflict: 'TB-CONFLICT' };
const staff = { id: secondId, email: 'scanner@example.test', fullName: 'Nguyễn Minh An', role: 'STAFF' };
const concerts = [
  { id: firstId, title: 'Đêm nhạc Sài Gòn', venueName: 'Nhà hát Thành phố' },
  { id: secondId, title: 'Hoà nhạc Hà Nội', venueName: 'Nhà hát Lớn' },
].map((event) => ({
  ...event, venueAddress: '', eventDate: now, doorsOpenAt: null, status: 'ON_SALE', posterUrl: null,
}));
const tickets = Object.values(code).map((qrCode, i) => ({
  ticketId: `b0000000-0000-4000-8000-00000000000${i}`,
  ticketTypeId: firstId, qrCode,
}));
const page = (content) => ({
  content, totalElements: content.length, totalPages: 1, size: 100, number: 0,
  first: true, last: true, empty: !content.length,
});

export function scannerFixture({ denyStaff = false } = {}) {
  const history = [];
  function accept(qrCode, concertId, gate, checkedAt) {
    const ticket = tickets.find((item) => item.qrCode === qrCode);
    if (!ticket) return null;
    history.push({
      id: ticket.ticketId, ticketId: ticket.ticketId, staffId: staff.id,
      deviceId: null, gate, concertId, checkedAt, syncAt: null, offline: false,
      notes: null, qrCode, ticketStatus: 'USED',
    });
    return ticket.ticketId;
  }
  return ({ pathname }, payload = {}, headers = {}) => {
    const ok = (data) => ({ status: 200, json: { success: true, message: 'OK', data } });
    const forbidden = { status: 403, json: { success: false, message: 'Không có quyền truy cập' } };
    if (pathname === '/api/auth/login') {
      return ok({ accessToken: 'fixture-token', tokenType: 'Bearer', expiresIn: 3600, user: staff });
    }
    if (pathname === '/api/organizations') {
      return ok([{ id: scannerOrganizationId, name: 'Tổ chức demo', grants: ['ADMISSION'] }]);
    }
    if (denyStaff || headers['x-organization-id'] !== scannerOrganizationId) return forbidden;
    if (pathname === '/api/v2/staff/performances') return ok(page(concerts));

    const [, , , , , concertId, endpoint] = pathname.split('/');
    if (endpoint === 'scan') {
      const { qrCode, gate } = payload;
      if (qrCode === 'TB-DENIED') return forbidden;
      if (qrCode === 'TB-EXPIRED') return { status: 401, json: { success: false, message: 'Phiên hết hạn' } };
      if ([code.pending, code.conflict].includes(qrCode)) return null;
      const ticketId = history.some((log) => log.concertId === concertId && log.qrCode === qrCode)
        ? null : accept(qrCode, concertId, gate, now);
      return ok({
        ticketId, concertId, status: ticketId ? 'SUCCESS' : 'FAILED',
        message: ticketId ? 'Soát vé thành công' : 'Vé không hợp lệ để check-in', checkAt: now,
      });
    }

    if (endpoint === 'sync') {
      const results = payload.logs.map((log) => {
        if (log.qrCode === code.conflict) {
          return { qrCode: log.qrCode, result: 'SKIPPED', reason: 'Vé đã được sử dụng' };
        }
        accept(log.qrCode, concertId, log.gate, log.checkedAt);
        return { qrCode: log.qrCode, result: 'ACCEPTED', reason: 'Đồng bộ thành công' };
      });
      const accepted = results.filter((entry) => entry.result === 'ACCEPTED').length;
      return ok({ total: results.length, accepted, skipped: results.length - accepted, invalid: 0, results });
    }

    const concert = concerts.find((event) => event.id === concertId);
    if (!concert) return { status: 404, json: { success: false, message: 'Không tìm thấy' } };
    if (endpoint === 'overview') {
      return ok({
        concert, totalTickets: tickets.length, validTickets: tickets.length, usedTickets: 0,
        cancelledTickets: 0, transferredTickets: 0, totalCheckins: 0, datasetUpdatedAt: null,
      });
    }
    if (endpoint === 'checkin-dataset') {
      return ok({ concertId, totalCount: tickets.length, tickets, generatedAt: now });
    }
    if (endpoint === 'tickets') {
      return ok(page(tickets.map((ticket) => ({
        ...ticket, status: 'VALID', issuedAt: now, usedAt: null,
      }))));
    }
    if (endpoint === 'guests') return ok(page([]));
    if (endpoint === 'checkins') return ok(page(history.filter((log) => log.concertId === concertId)));
    return { status: 404, json: { success: false, message: 'Không tìm thấy' } };
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const fixture = scannerFixture({ denyStaff: process.argv.includes('--deny-staff') });
  const host = process.env.TICKETBOX_SCANNER_FIXTURE_HOST ?? '127.0.0.1';
  const port = Number(process.env.TICKETBOX_SCANNER_FIXTURE_PORT ?? '8093');
  const server = createServer(async (req, res) => {
    let body = '';
    for await (const chunk of req) body += chunk;
    try {
      const result = fixture(new URL(req.url, 'http://localhost'), body ? JSON.parse(body) : {}, req.headers);
      if (!result) return req.socket.destroy();
      res.writeHead(result.status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result.json));
    } catch {
      res.writeHead(400, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ success: false, message: 'Invalid fixture request' }));
    }
  });
  server.listen(port, host, () => console.log(`Scanner fixture listening on ${host}:${port}`));
}
