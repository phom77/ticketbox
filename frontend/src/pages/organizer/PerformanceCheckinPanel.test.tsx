import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../api/client';

const api = vi.hoisted(() => ({
  getManagedCheckinSummary: vi.fn(),
  getPerformanceAdmissions: vi.fn(),
  getAdmissionStaff: vi.fn(),
}));
const grants = vi.hoisted(() => ({ value: ['EVENTS'] as string[] }));

vi.mock('../../api/management/checkin', () => ({
  getManagedCheckinSummary: api.getManagedCheckinSummary,
  getPerformanceAdmissions: api.getPerformanceAdmissions,
}));
vi.mock('../../api/organizations', () => ({ getAdmissionStaff: api.getAdmissionStaff }));
vi.mock('../../features/organizations/OrganizationProvider', () => ({
  useOrganization: () => ({ selected: { id: 'org', grants: grants.value } }),
}));

import { PerformanceCheckinPanel } from './PerformanceCheckinPanel';

const summary = {
  concertId: 'p1',
  totalTickets: 12,
  validTickets: 6,
  usedTickets: 4,
  cancelledTickets: 2,
  transferredTickets: 0,
  checkedIn: 4,
  onlineCheckins: 3,
  offlineCheckins: 1,
  latestCheckedAt: null,
  datasetUpdatedAt: null,
  gates: [
    { gate: 'North', checkedIn: 3, latestCheckedAt: null },
    { gate: null, checkedIn: 1, latestCheckedAt: null },
  ],
  guestsTotal: 5,
  guestsCheckedIn: 2,
};
const admission = {
  id: 'a1',
  ticketId: 'ticket-0001',
  concertId: 'p1',
  staffId: 's1',
  checkedAt: '2040-07-15T12:00:00Z',
  syncAt: null,
  offline: false,
  gate: 'North',
  ticketStatus: 'USED',
  referenceCode: 'VE-1',
  ticketTypeName: 'GA',
};

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, value: state });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function flush() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  grants.value = ['EVENTS'];
  api.getManagedCheckinSummary.mockResolvedValue(summary);
  api.getPerformanceAdmissions.mockResolvedValue({ content: [admission] });
  api.getAdmissionStaff.mockResolvedValue([
    { accountId: 's1', fullName: 'Lan Tran', email: 'l@x' },
  ]);
});
afterEach(() => {
  setVisibility('visible');
  vi.useRealTimers();
  vi.resetAllMocks();
});

describe('PerformanceCheckinPanel', () => {
  it('shows totals, gates, guests and recent admissions without credentials', async () => {
    render(<PerformanceCheckinPanel id="p1" timezone="Asia/Ho_Chi_Minh" />);
    await flush();
    expect(screen.getByText('4 of 10 valid tickets admitted')).toBeVisible();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '40');
    expect(screen.getByText('North: 3')).toBeVisible();
    expect(screen.getByText('No gate: 1')).toBeVisible();
    expect(screen.getByText('2 of 5')).toBeVisible();
    expect(screen.getByText('Lan Tran')).toBeVisible();
    expect(screen.getByText('VE-1')).toBeVisible();
    expect(api.getPerformanceAdmissions).toHaveBeenCalledWith('p1', 10, expect.anything());
  });

  it('refreshes every 15 seconds while visible and pauses when hidden', async () => {
    render(<PerformanceCheckinPanel id="p1" timezone="Asia/Ho_Chi_Minh" />);
    await flush();
    expect(api.getManagedCheckinSummary).toHaveBeenCalledTimes(1);
    await act(async () => void vi.advanceTimersByTime(15_000));
    await flush();
    expect(api.getManagedCheckinSummary).toHaveBeenCalledTimes(2);
    act(() => setVisibility('hidden'));
    await act(async () => void vi.advanceTimersByTime(60_000));
    expect(api.getManagedCheckinSummary).toHaveBeenCalledTimes(2);
    act(() => setVisibility('visible'));
    await flush();
    expect(api.getManagedCheckinSummary).toHaveBeenCalledTimes(3);
  });

  it('keeps the last figures, marks them stale and retries after a failed refresh', async () => {
    render(<PerformanceCheckinPanel id="p1" timezone="Asia/Ho_Chi_Minh" />);
    await flush();
    api.getManagedCheckinSummary.mockRejectedValueOnce(new ApiClientError('down', 503));
    await act(async () => void vi.advanceTimersByTime(15_000));
    await flush();
    expect(screen.getByText(/could not be refreshed/)).toBeVisible();
    expect(screen.getByText('4 of 10 valid tickets admitted')).toBeVisible();
    expect(screen.getByText(/Not current/)).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await flush();
    expect(screen.queryByText(/could not be refreshed/)).toBeNull();
  });

  it('stops refreshing and explains when the grant is removed', async () => {
    render(<PerformanceCheckinPanel id="p1" timezone="Asia/Ho_Chi_Minh" />);
    await flush();
    api.getManagedCheckinSummary.mockRejectedValue(new ApiClientError('no', 403));
    await act(async () => void vi.advanceTimersByTime(15_000));
    await flush();
    expect(screen.getByText(/no longer have access/)).toBeVisible();
    const calls = api.getManagedCheckinSummary.mock.calls.length;
    await act(async () => void vi.advanceTimersByTime(60_000));
    expect(api.getManagedCheckinSummary.mock.calls.length).toBe(calls);
  });

  it('shows times in the venue time zone and does not announce routine updates', async () => {
    render(<PerformanceCheckinPanel id="p1" timezone="Asia/Ho_Chi_Minh" />);
    await flush();
    // 12:00 UTC is 19:00 in Ho Chi Minh City.
    expect(screen.getByText(/7:00:00\s?PM/)).toBeVisible();
    expect(screen.getByText(/Asia\/Ho_Chi_Minh/)).toBeVisible();
    expect(screen.getByText(/^Updated /)).not.toHaveAttribute('aria-live');
    expect(screen.queryByRole('status')).toBeNull();
  });

  it('is absent without the Events permission', () => {
    grants.value = ['FINANCE'];
    const { container } = render(<PerformanceCheckinPanel id="p1" timezone="Asia/Ho_Chi_Minh" />);
    expect(container).toBeEmptyDOMElement();
    expect(api.getManagedCheckinSummary).not.toHaveBeenCalled();
  });
});
