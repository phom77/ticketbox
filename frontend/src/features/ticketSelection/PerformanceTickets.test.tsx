import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ToastContext } from '../../components/feedback/toast-context';
import { ApiClientError } from '../../api/client';
import * as api from '../../api/performances';
import { PerformanceTickets } from './PerformanceTickets';

vi.mock('../../api/queue', () => ({
  getStoredQueueAdmission: () => ({
    concertId: 'p1',
    queueAccessToken: 'token',
    sessionExpiresAt: new Date(Date.now() + 3_600_000).toISOString(),
  }),
  clearStoredQueueAdmission: vi.fn(),
  leaveQueue: vi.fn(),
}));
vi.mock('../../api/orders', () => ({ getOrderByIdempotencyKey: vi.fn() }));
vi.mock('../../api/performances', async (original) => ({
  ...(await original<typeof import('../../api/performances')>()),
  getEventPerformance: vi.fn(),
  getLayout: vi.fn(),
  getAvailability: vi.fn(),
  getHold: vi.fn(),
  getMapSection: vi.fn(),
  getSectionAvailability: vi.fn(),
  replaceHold: vi.fn(),
}));

const square = (x: number) => [
  { x, y: 0 },
  { x: x + 80, y: 0 },
  { x: x + 80, y: 80 },
  { x, y: 80 },
];
const layout = {
  version: 1,
  width: 400,
  height: 200,
  shapes: [],
  sections: [
    { id: 'a', code: 'A', label: 'Zone A', kind: 'ASSIGNED' as const, points: square(0) },
    { id: 'b', code: 'B', label: 'Zone B', kind: 'ASSIGNED' as const, points: square(100) },
  ],
};
const offer = (id: string, extra = {}) => ({ id, name: id, price: 100000, active: true, ...extra });
const availability = {
  layoutVersion: 1,
  saleVersion: 1,
  groups: [
    {
      id: 'ga',
      sectionId: null,
      sectionLabel: 'Floor',
      kind: 'GA' as const,
      available: 10,
      offers: [offer('Pair', { description: 'Includes a poster', minPerOrder: 2 })],
    },
    {
      id: 'ga-a',
      sectionId: 'a',
      sectionLabel: 'Zone A',
      kind: 'ASSIGNED' as const,
      available: 5,
      offers: [offer('Offer A')],
    },
    {
      id: 'ga-b',
      sectionId: 'b',
      sectionLabel: 'Zone B',
      kind: 'ASSIGNED' as const,
      available: 5,
      offers: [offer('Offer B')],
    },
  ],
};
const mapSection = (id: string, label: string) => ({
  version: 1,
  section: {
    id,
    code: id,
    label,
    kind: 'ASSIGNED' as const,
    points: square(id === 'a' ? 0 : 100),
    rows: [
      {
        id: 'r-' + id,
        code: 'R',
        label: 'R',
        seats: [
          {
            id: 's-' + id,
            label: id.toUpperCase() + '1',
            x: 10,
            y: 10,
            accessible: false,
            restrictedView: false,
            blocked: false,
            segment: 'R',
            position: 1,
          },
        ],
      },
    ],
  },
});
const stock = (id: string) => ({
  layoutVersion: 1,
  saleVersion: 1,
  sectionId: id,
  seats: [{ id: 's-' + id, available: true, groupId: 'ga-' + id }],
});

function renderPage() {
  render(
    <ToastContext.Provider value={{ success: vi.fn(), error: vi.fn() }}>
      <MemoryRouter>
        <PerformanceTickets id="p1" eventId="e1" />
      </MemoryRouter>
    </ToastContext.Provider>,
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getEventPerformance).mockResolvedValue({
    event: { title: 'Show' },
    performance: {
      id: 'p1',
      layoutVersion: 1,
      timezone: 'Asia/Ho_Chi_Minh',
      startsAt: '2026-12-31T12:00:00Z',
      venueName: 'Hall',
      maxPerAccount: 4,
    },
  } as never);
  vi.mocked(api.getAvailability).mockResolvedValue(availability);
  vi.mocked(api.getHold).mockResolvedValue({
    version: 0,
    expiresAt: null,
    items: [],
    totalAmount: 0,
  });
});

describe('PerformanceTickets', () => {
  it('shows the description and minimum, and steps a pair ticket from 0 to 2', async () => {
    vi.mocked(api.getLayout).mockResolvedValue(layout);
    vi.mocked(api.replaceHold).mockResolvedValue({
      version: 1,
      expiresAt: null,
      items: [],
      totalAmount: 0,
    });
    renderPage();
    expect(await screen.findByText('Includes a poster')).toBeVisible();
    expect(screen.getByText('Minimum 2 per order')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Add one Pair ticket' }));
    await waitFor(() => expect(api.replaceHold).toHaveBeenCalled());
    expect(vi.mocked(api.replaceHold).mock.calls[0][3].items).toEqual([
      { offerId: 'Pair', quantity: 2 },
    ]);
  });

  it('offers the list with a retry when the map cannot be loaded', async () => {
    vi.mocked(api.getLayout).mockRejectedValue(new Error('down'));
    renderPage();
    expect(await screen.findByText(/The map is unavailable right now/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry the map' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Add one Pair ticket' })).toBeVisible();
    vi.mocked(api.getLayout).mockResolvedValue(layout);
    fireEvent.click(screen.getByRole('button', { name: 'Retry the map' }));
    await waitFor(() => expect(screen.queryByText(/The map is unavailable/)).toBeNull());
  });

  it('ignores a late response for a zone the buyer has already left', async () => {
    vi.mocked(api.getLayout).mockResolvedValue(layout);
    let releaseA: (value: ReturnType<typeof mapSection>) => void = () => undefined;
    vi.mocked(api.getMapSection).mockImplementation((_id, sectionId) =>
      sectionId === 'a'
        ? new Promise((resolve) => (releaseA = resolve as typeof releaseA))
        : Promise.resolve(mapSection('b', 'Zone B')),
    );
    vi.mocked(api.getSectionAvailability).mockImplementation((_id, sectionId) =>
      Promise.resolve(stock(sectionId)),
    );
    renderPage();
    fireEvent.click(await screen.findByRole('button', { name: /Zone A/ }));
    // The buyer switches zone through the ticket list while zone A is still loading.
    const viewSeats = await screen.findAllByRole('button', { name: 'View seats' });
    fireEvent.click(viewSeats[1]);
    expect(await screen.findByRole('heading', { name: 'Seats in Zone B' })).toBeVisible();
    await act(async () => releaseA(mapSection('a', 'Zone A')));
    expect(screen.getByRole('heading', { name: 'Seats in Zone B' })).toBeVisible();
    expect(screen.queryByRole('heading', { name: 'Seats in Zone A' })).toBeNull();
    expect(screen.queryByText('A1')).toBeNull();
    expect(screen.getAllByText('B1').length).toBeGreaterThan(0);
  });

  describe('seated minimum', () => {
    const seatedOffer = {
      ...availability.groups[1],
      offers: [offer('Offer A', { minPerOrder: 2 })],
    };
    const twoSeats = () => {
      const base = mapSection('a', 'Zone A');
      const seat = base.section.rows[0].seats[0];
      return {
        ...base,
        section: {
          ...base.section,
          rows: [
            {
              ...base.section.rows[0],
              seats: [seat, { ...seat, id: 's-a2', label: 'A2', x: 30, position: 2 }],
            },
          ],
        },
      };
    };
    const seatStock = {
      ...stock('a'),
      seats: [
        { id: 's-a', available: true, groupId: 'ga-a' },
        { id: 's-a2', available: true, groupId: 'ga-a' },
      ],
    };
    const heldLine = (seatId: string, label: string) => ({
      offerId: 'Offer A',
      offerName: 'Offer A',
      seatId,
      rowLabel: 'R',
      seatLabel: label,
      sectionLabel: 'Zone A',
      unitPrice: 100000,
      quantity: 1,
    });
    async function openZone() {
      vi.mocked(api.getLayout).mockResolvedValue(layout);
      vi.mocked(api.getAvailability).mockResolvedValue({
        ...availability,
        groups: [availability.groups[0], seatedOffer, availability.groups[2]],
      });
      vi.mocked(api.getMapSection).mockResolvedValue(twoSeats());
      vi.mocked(api.getSectionAvailability).mockResolvedValue(seatStock);
      renderPage();
      fireEvent.click((await screen.findAllByRole('button', { name: 'View seats' }))[0]);
      await screen.findByRole('button', { name: 'Row R, seat A1' });
    }
    const seat = (label: string) => screen.getByRole('button', { name: 'Row R, seat ' + label });

    it('keeps a lone seat pending with a hint, then holds both once the minimum is met', async () => {
      vi.mocked(api.replaceHold).mockResolvedValue({
        version: 1,
        expiresAt: null,
        totalAmount: 200000,
        items: [heldLine('s-a', 'A1'), heldLine('s-a2', 'A2')],
      });
      await openZone();
      fireEvent.click(seat('A1'));
      expect(
        await screen.findByText('Choose at least 2 seats for Offer A (1 chosen so far).'),
      ).toBeVisible();
      expect(api.replaceHold).not.toHaveBeenCalled();
      expect(seat('A1')).toHaveAttribute('aria-pressed', 'true');
      expect(seat('A1').getAttribute('aria-description')).toContain('Selected, not yet reserved');
      fireEvent.click(seat('A2'));
      await waitFor(() => expect(api.replaceHold).toHaveBeenCalledTimes(1));
      expect(vi.mocked(api.replaceHold).mock.calls[0][3].items).toEqual([
        { offerId: 'Offer A', seatId: 's-a' },
        { offerId: 'Offer A', seatId: 's-a2' },
      ]);
      await waitFor(() => expect(screen.queryByText(/Choose at least 2 seats/)).toBeNull());
    });

    it('keeps the pending choice when the server refuses the hold', async () => {
      vi.mocked(api.replaceHold).mockRejectedValue(new ApiClientError('Quota exceeded', 422));
      await openZone();
      fireEvent.click(seat('A1'));
      fireEvent.click(seat('A2'));
      await waitFor(() => expect(api.replaceHold).toHaveBeenCalledTimes(1));
      expect(await screen.findByRole('alert')).toBeVisible();
      expect(seat('A1')).toHaveAttribute('aria-pressed', 'true');
      expect(seat('A1').getAttribute('aria-description')).toContain('not yet reserved');
    });

    it('does not turn the remaining seat into a pending one when the release fails', async () => {
      vi.mocked(api.getHold).mockResolvedValue({
        version: 3,
        expiresAt: null,
        totalAmount: 200000,
        items: [heldLine('s-a', 'A1'), heldLine('s-a2', 'A2')],
      });
      vi.mocked(api.replaceHold).mockRejectedValue(new Error('down'));
      await openZone();
      await waitFor(() => expect(seat('A1')).toHaveAttribute('aria-pressed', 'true'));
      fireEvent.click(seat('A1'));
      await waitFor(() => expect(api.replaceHold).toHaveBeenCalledTimes(1));
      expect(await screen.findByRole('alert')).toBeVisible();
      expect(seat('A2').getAttribute('aria-description')).not.toContain('not yet reserved');
      expect(seat('A1')).toHaveAttribute('aria-pressed', 'true');
      expect(screen.queryByText(/Choose at least 2 seats/)).toBeNull();
    });

    it('moves the remaining seat to pending after a confirmed release', async () => {
      vi.mocked(api.getHold).mockResolvedValue({
        version: 3,
        expiresAt: null,
        totalAmount: 200000,
        items: [heldLine('s-a', 'A1'), heldLine('s-a2', 'A2')],
      });
      vi.mocked(api.replaceHold).mockResolvedValue({
        version: 4,
        expiresAt: null,
        totalAmount: 0,
        items: [],
      });
      await openZone();
      await waitFor(() => expect(seat('A1')).toHaveAttribute('aria-pressed', 'true'));
      fireEvent.click(seat('A1'));
      expect(await screen.findByText(/Choose at least 2 seats/)).toBeVisible();
      expect(seat('A2').getAttribute('aria-description')).toContain('not yet reserved');
      expect(seat('A1')).toHaveAttribute('aria-pressed', 'false');
    });
  });
});
