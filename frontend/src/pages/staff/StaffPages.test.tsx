import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '../../api/client';
import type { StaffGuest, StaffPerformance } from '../../api/admin';

const api = vi.hoisted(() => ({
  getStaffPerformances: vi.fn(),
  getStaffCheckinHistory: vi.fn(),
  getStaffGuests: vi.fn(),
  checkInStaffGuest: vi.fn(),
  scanStaffTicket: vi.fn(),
}));
const organization = vi.hoisted(() => ({
  value: {
    loading: false,
    error: '',
    memberships: [{ id: 'org', name: 'Org', grants: ['ADMISSION'] }],
    selected: { id: 'org', name: 'Org', grants: ['ADMISSION'] },
    choose: vi.fn(),
    reload: vi.fn(),
  } as unknown,
}));

vi.mock('../../api/admin', async (original) => ({
  ...(await original<typeof import('../../api/admin')>()),
  ...api,
}));
vi.mock('../../features/organizations/OrganizationProvider', () => ({
  useOrganization: () => organization.value,
}));

import { StaffCheckInPage } from './StaffCheckInPage';
import { StaffGuestsPage } from './StaffGuestsPage';
import { StaffHistoryPage } from './StaffHistoryPage';
import { StaffOverviewPage } from './StaffOverviewPage';

const soon = new Date(Date.now() + 3_600_000).toISOString();
function performance(id: string, title: string): StaffPerformance {
  return {
    id,
    title,
    venueName: 'Hall',
    venueAddress: 'Street',
    eventDate: soon,
    doorsOpenAt: null,
    status: 'ON_SALE',
    posterUrl: null,
  };
}
function page<T>(content: T[], last = true) {
  return { content, last, totalElements: content.length };
}
function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/staff" element={<StaffOverviewPage />} />
        <Route path="/staff/check-in" element={<StaffCheckInPage />} />
        <Route path="/staff/guests" element={<StaffGuestsPage />} />
        <Route path="/staff/history" element={<StaffHistoryPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
const scanned = (status: 'SUCCESS' | 'FAILED', message = 'm') => ({
  data: { ticketId: 't1', concertId: 'p1', status, message, checkAt: soon },
  message: '',
});

beforeEach(() => {
  vi.resetAllMocks();
  organization.value = {
    loading: false,
    error: '',
    memberships: [{ id: 'org', name: 'Org', grants: ['ADMISSION'] }],
    selected: { id: 'org', name: 'Org', grants: ['ADMISSION'] },
    choose: vi.fn(),
    reload: vi.fn(),
  };
  api.getStaffPerformances.mockResolvedValue(page([performance('p1', 'Night one')]));
  api.getStaffCheckinHistory.mockResolvedValue(page([]));
});

describe('staff access states', () => {
  it('lists assigned performances with links', async () => {
    api.getStaffPerformances.mockResolvedValue(
      page([performance('p1', 'Night one'), performance('p2', 'Night two')]),
    );
    renderAt('/staff');
    expect(await screen.findByRole('heading', { name: 'Night one' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Night two' })).toBeVisible();
    expect(screen.getAllByRole('link', { name: 'Check in' })[0]).toHaveAttribute(
      'href',
      '/staff/check-in?performance=p1',
    );
  });

  it('explains a missing Admission organization without scan controls', () => {
    organization.value = {
      ...(organization.value as object),
      selected: undefined,
      memberships: [],
    };
    renderAt('/staff/check-in');
    expect(screen.getByText('No organization has given you Admission access')).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull();
  });

  it('explains when nothing is assigned', async () => {
    api.getStaffPerformances.mockResolvedValue(page([]));
    renderAt('/staff');
    expect(await screen.findByText('You are not assigned to a performance yet')).toBeVisible();
  });

  it('offers a retry when Check-in is unavailable', async () => {
    api.getStaffPerformances.mockRejectedValueOnce(new ApiClientError('down', 503));
    renderAt('/staff');
    expect(await screen.findByText('Check-in is not reachable')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('heading', { name: 'Night one' })).toBeVisible();
  });

  it('refuses a performance that is not assigned', async () => {
    renderAt('/staff/check-in?performance=other');
    expect(await screen.findByText('This performance is not assigned to you')).toBeVisible();
    expect(screen.queryByLabelText('Ticket code')).toBeNull();
  });
});

describe('online admission', () => {
  it('shows Allowed in only after Check-in confirms', async () => {
    let resolve: (value: unknown) => void = () => undefined;
    api.scanStaffTicket.mockReturnValue(new Promise((done) => (resolve = done)));
    renderAt('/staff/check-in?performance=p1');
    fireEvent.change(await screen.findByLabelText('Ticket code'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(screen.queryByText('Allowed in')).toBeNull();
    resolve(scanned('SUCCESS'));
    expect(await screen.findByText('Allowed in')).toBeVisible();
    expect(api.scanStaffTicket).toHaveBeenCalledWith(
      'p1',
      expect.objectContaining({ qrCode: 'abc', gate: 'WEB' }),
    );
  });

  it('sends one request for repeated submits while one runs', async () => {
    api.scanStaffTicket.mockReturnValue(new Promise(() => undefined));
    renderAt('/staff/check-in?performance=p1');
    const input = await screen.findByLabelText('Ticket code');
    fireEvent.change(input, { target: { value: 'abc' } });
    const form = input.closest('form') as HTMLFormElement;
    fireEvent.submit(form);
    fireEvent.submit(form);
    expect(api.scanStaffTicket).toHaveBeenCalledTimes(1);
  });

  it('shows a rejected code as Not accepted', async () => {
    api.scanStaffTicket.mockResolvedValue(scanned('FAILED', 'Ticket already used'));
    renderAt('/staff/check-in?performance=p1');
    fireEvent.change(await screen.findByLabelText('Ticket code'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(await screen.findByText('Not accepted')).toBeVisible();
    expect(screen.getByText('Ticket already used')).toBeVisible();
  });

  it('shows Not recorded and keeps the code when Check-in is unreachable', async () => {
    api.scanStaffTicket.mockRejectedValue(new ApiClientError('network', 500));
    renderAt('/staff/check-in?performance=p1');
    const input = await screen.findByLabelText('Ticket code');
    fireEvent.change(input, { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(await screen.findByText('Not recorded')).toBeVisible();
    expect(screen.queryByText('Allowed in')).toBeNull();
    expect(input).toHaveValue('abc');
  });

  it('stops and explains when access is removed mid-session', async () => {
    api.scanStaffTicket.mockRejectedValue(new ApiClientError('forbidden', 403));
    renderAt('/staff/check-in?performance=p1');
    fireEvent.change(await screen.findByLabelText('Ticket code'), { target: { value: 'abc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    expect(await screen.findByText('You no longer have access to this performance')).toBeVisible();
    expect(screen.queryByLabelText('Ticket code')).toBeNull();
  });
});

describe('guests and history', () => {
  const guest = (id: string, name: string, checkedInAt: string | null = null): StaffGuest => ({
    found: true,
    guestId: id,
    concertId: 'p1',
    phone: '0900000' + id,
    fullName: name,
    category: null,
    sponsorName: null,
    notes: null,
    checkedInAt,
    checkinGate: checkedInAt ? 'North' : null,
  });

  it('searches guests, checks one in and shows a checked-in guest without the action', async () => {
    api.getStaffGuests.mockResolvedValue(page([guest('1', 'Alice'), guest('2', 'Bob', soon)]));
    api.checkInStaffGuest.mockResolvedValue({ data: guest('1', 'Alice', soon), message: '' });
    renderAt('/staff/guests?performance=p1');
    expect(await screen.findByText('Alice')).toBeVisible();
    expect(screen.getAllByRole('button', { name: 'Check in' })).toHaveLength(1);
    expect(screen.getByText(/gate North/)).toBeVisible();
    fireEvent.change(screen.getByLabelText(/Search by name or phone/), {
      target: { value: 'ali' },
    });
    expect(screen.queryByText('Bob')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Check in' }));
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Check in' })).toBeNull());
    expect(api.checkInStaffGuest).toHaveBeenCalledWith('p1', '1', 'WEB');
  });

  it('lists history without QR values and retries a failure', async () => {
    api.getStaffCheckinHistory.mockRejectedValueOnce(new ApiClientError('x', 500));
    api.getStaffCheckinHistory.mockResolvedValue(
      page([
        {
          id: 'h1',
          ticketId: 'ticket-1234',
          concertId: 'p1',
          staffId: 's',
          deviceId: 'staff-web-1',
          checkedAt: soon,
          syncAt: null,
          offline: false,
          gate: 'A',
          notes: null,
          ticketStatus: 'USED',
          referenceCode: 'VE-1',
          ticketTypeName: 'GA',
        },
      ]),
    );
    renderAt('/staff/history?performance=p1');
    expect(await screen.findByText('The history could not be loaded.')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('VE-1')).toBeVisible();
    expect(screen.queryByText('staff-web-1')).toBeNull();
  });
});
