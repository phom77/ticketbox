import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as admin from '../../api/admin';
import * as organizations from '../../features/organizations/OrganizationProvider';
import type { ManagedPerformance } from '../../api/performanceManagement';
import { LegacyConcertSummary } from './LegacyConcertSummary';

vi.mock('../../api/admin');
vi.mock('../../features/organizations/OrganizationProvider');
vi.mock('./PerformanceGuests', () => ({
  PerformanceGuests: ({ performanceId }: { performanceId: string }) => (
    <div>Guests for {performanceId}</div>
  ),
}));

const performance = {
  id: 'p1',
  eventId: 'c1',
  legacyConcertId: 'c1',
  venueName: 'Opera House',
  venueAddress: '1 Trang Tien',
  startsAt: '2026-12-20T12:00:00Z',
  saleStartAt: '2026-12-01T03:00:00Z',
  saleEndAt: null,
  status: 'ON_SALE',
  salesSuspended: false,
} as unknown as ManagedPerformance;

function grants(...values: string[]) {
  vi.mocked(organizations.useOrganization).mockReturnValue({
    selected: { id: 'o1', name: 'Org', grants: values },
  } as unknown as ReturnType<typeof organizations.useOrganization>);
}

beforeEach(() => {
  vi.resetAllMocks();
  grants('EVENTS', 'FINANCE');
});

describe('LegacyConcertSummary', () => {
  it('shows a read-only summary with guests, orders and reports and no editing controls', async () => {
    vi.mocked(admin.getAdminTicketTypes).mockResolvedValue([
      { id: 't1', name: 'Standard', price: 500_000, totalQuantity: 60, availableQty: 25 },
    ] as Awaited<ReturnType<typeof admin.getAdminTicketTypes>>);
    render(
      <MemoryRouter>
        <LegacyConcertSummary eventId="c1" performance={performance} title="Autumn Jazz" />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Standard')).toBeInTheDocument();
    expect(screen.getByText('25 / 60')).toBeInTheDocument();
    expect(screen.getByText('Guests for c1')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Report' })).toHaveAttribute(
      'href',
      '/organizer/reports?concertId=c1',
    );
    expect(screen.getByRole('link', { name: 'Orders' })).toHaveAttribute(
      'href',
      '/organizer/orders?concertId=c1',
    );
    expect(screen.getByRole('link', { name: 'Preview' })).toHaveAttribute(
      'href',
      '/organizer/events/c1/preview',
    );
    expect(screen.getByRole('heading', { name: 'Request a change' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /edit|delete|save/i })).not.toBeInTheDocument();
    expect(admin.getAdminTicketTypes).toHaveBeenCalledWith('c1', expect.anything(), 'organizer');
  });

  it('hides the orders link from members without finance access', async () => {
    grants('EVENTS');
    vi.mocked(admin.getAdminTicketTypes).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <LegacyConcertSummary eventId="c1" performance={performance} title="Autumn Jazz" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('link', { name: 'Report' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Orders' })).not.toBeInTheDocument();
  });

  it("shows times in the performance's own time zone", async () => {
    vi.mocked(admin.getAdminTicketTypes).mockResolvedValue([]);
    render(
      <MemoryRouter>
        <LegacyConcertSummary
          eventId="c1"
          performance={{ ...performance, timezone: 'America/New_York' }}
          title="Autumn Jazz"
        />
      </MemoryRouter>,
    );
    // 12:00 UTC on 20 December is 07:00 in New York.
    expect(await screen.findByText(/7:00\s?AM/)).toBeInTheDocument();
  });

  it('lets the organizer retry when ticket types cannot be read', async () => {
    vi.mocked(admin.getAdminTicketTypes).mockRejectedValueOnce(new Error('Unavailable'));
    vi.mocked(admin.getAdminTicketTypes).mockResolvedValueOnce([]);
    render(
      <MemoryRouter>
        <LegacyConcertSummary eventId="c1" performance={performance} title="Autumn Jazz" />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('Unavailable');
  });
});
