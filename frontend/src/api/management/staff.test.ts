import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { InternalAxiosRequestConfig } from 'axios';
import { api, setRequestOrganization } from '../client';
import {
  checkInStaffGuest,
  getStaffCheckinHistory,
  getStaffGuests,
  getStaffPerformanceOverview,
  getStaffPerformances,
  getStaffTickets,
  scanStaffTicket,
} from './staff';

describe('staff API client', () => {
  const requests: InternalAxiosRequestConfig[] = [];
  const original = api.defaults.adapter;

  beforeEach(() => {
    requests.length = 0;
    setRequestOrganization('org-b');
    api.defaults.adapter = async (config) => {
      requests.push(config);
      return {
        data: { code: 200, message: 'ok', data: { content: [], last: true } },
        status: 200,
        statusText: 'OK',
        headers: {},
        config,
      };
    };
  });

  afterEach(() => {
    api.defaults.adapter = original;
    setRequestOrganization(null);
  });

  it('uses only the performance-scoped routes and sends the selected organization', async () => {
    await getStaffPerformances(1, 50);
    await getStaffPerformanceOverview('p 1');
    await getStaffTickets('p1', ' VE-1 ');
    await getStaffCheckinHistory('p1', 2, 20);
    await getStaffGuests('p1', 0, 100);
    await checkInStaffGuest('p1', 'g1', 'A');
    await scanStaffTicket('p1', { qrCode: 'code', deviceId: 'staff-web-1', gate: 'A' });

    expect(requests.map((request) => `${request.method} ${request.url}`)).toEqual([
      'get /api/v2/staff/performances?page=1&size=50',
      'get /api/v2/staff/performances/p%201/overview',
      'get /api/v2/staff/performances/p1/tickets?query=VE-1&page=0&size=20',
      'get /api/v2/staff/performances/p1/checkins?page=2&size=20',
      'get /api/v2/staff/performances/p1/guests?page=0&size=100',
      'post /api/v2/staff/performances/p1/guests/g1/check-in',
      'post /api/v2/staff/performances/p1/scan',
    ]);
    for (const request of requests) {
      expect(request.headers.get('X-Organization-Id')).toBe('org-b');
      expect(request.url).not.toContain('/api/staff/');
      expect(request.url).not.toMatch(/checkin-dataset|\/sync/);
    }
    expect(JSON.parse(requests[6].data)).toEqual({
      qrCode: 'code',
      deviceId: 'staff-web-1',
      gate: 'A',
    });
    expect(requests[6].timeout).toBeGreaterThan(0);
  });
});
