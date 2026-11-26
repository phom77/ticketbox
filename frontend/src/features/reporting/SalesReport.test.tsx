import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SalesBreakdown, SalesSummary, SalesTrend } from '../../api/sales';
import { OverviewSales } from './OverviewSales';
import { SalesReport } from './SalesReport';

const api = vi.hoisted(() => ({
  getSalesSummary: vi.fn(),
  getSalesTrend: vi.fn(),
  getSalesBreakdown: vi.fn(),
  getSalesEvents: vi.fn(),
  getSalesOnSale: vi.fn(),
  getSalesUpcoming: vi.fn(),
  exportSalesReport: vi.fn(),
}));
vi.mock('../../api/sales', () => api);
vi.mock('../../api/management/checkin', () => ({
  getManagedCheckinSummary: vi.fn().mockResolvedValue({
    checkedIn: 3,
    validTickets: 7,
    usedTickets: 3,
  }),
}));
vi.mock('../../components/feedback/toast-context', () => ({
  useToast: () => ({ error: vi.fn(), success: vi.fn() }),
}));

const summary = (money: boolean): SalesSummary => ({
  scope: { type: 'ORGANIZATION' },
  from: '2026-12-01',
  to: '2026-12-07',
  timezone: 'Asia/Ho_Chi_Minh',
  provisional: true,
  ticketsSold: 12,
  ticketsRefunded: 2,
  netTickets: 10,
  orders: 6,
  ...(money ? { grossSales: 1200000, refunds: 200000, netSales: 1000000 } : {}),
});
const trend = (money: boolean): SalesTrend => ({
  groupBy: 'day',
  timezone: 'Asia/Ho_Chi_Minh',
  from: '2026-12-01',
  to: '2026-12-07',
  provisional: true,
  buckets: [
    {
      start: '2026-12-01T00:00:00',
      ticketsSold: 12,
      ticketsRefunded: 2,
      netTickets: 10,
      orders: 6,
      ...(money ? { grossSales: 1200000, refunds: 200000, netSales: 1000000 } : {}),
    },
  ],
});
const breakdown: SalesBreakdown = {
  by: 'performance',
  timezone: 'Asia/Ho_Chi_Minh',
  from: '2026-12-01',
  to: '2026-12-07',
  provisional: true,
  rows: [
    {
      key: 'p1',
      performanceId: 'p1',
      eventId: 'e1',
      label: 'Opening night',
      provisional: true,
      ticketsSold: 12,
      ticketsRefunded: 2,
      netTickets: 10,
      orders: 6,
      grossSales: 1200000,
      refunds: 200000,
      netSales: 1000000,
    },
  ],
};

function load(money: boolean) {
  api.getSalesSummary.mockResolvedValue(summary(money));
  api.getSalesTrend.mockResolvedValue(trend(money));
  api.getSalesBreakdown.mockResolvedValue(money ? breakdown : { ...breakdown, rows: [] });
}

const noEvents = { content: [], page: 0, size: 20, hasMore: false };

describe('Reports > Sales', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.getSalesEvents.mockResolvedValue(noEvents);
  });

  it('lets a finance-only member pick an event from the sales events', async () => {
    load(true);
    api.getSalesEvents.mockResolvedValue({
      ...noEvents,
      content: [
        {
          eventId: 'e1',
          title: 'Spring tour',
          performances: [
            {
              id: 'p1',
              title: 'Opening night',
              startsAt: '2026-12-02T12:00:00Z',
              timezone: 'Asia/Ho_Chi_Minh',
            },
          ],
        },
      ],
    });
    render(
      <MemoryRouter>
        <SalesReport finance />
      </MemoryRouter>,
    );
    await screen.findByText('Net sales', { selector: 'span' });
    fireEvent.click(screen.getByRole('button', { name: /all events/i }));
    fireEvent.click(await screen.findByRole('option', { name: /spring tour/i }));
    await waitFor(() =>
      expect(api.getSalesSummary).toHaveBeenLastCalledWith(
        expect.objectContaining({ eventId: 'e1' }),
        expect.anything(),
      ),
    );
    expect(await screen.findByRole('option', { name: /opening night/i })).toBeInTheDocument();
  });

  it('ignores a grouping from the URL that does not fit the range', async () => {
    load(false);
    render(
      <MemoryRouter initialEntries={['/?from=2026-01-01&to=2026-12-01&groupBy=hour']}>
        <SalesReport finance={false} />
      </MemoryRouter>,
    );
    await screen.findByText('Tickets sold', { selector: 'span' });
    expect(api.getSalesTrend).toHaveBeenCalledWith(expect.anything(), undefined, expect.anything());
  });

  it('names the export after the server filename', async () => {
    load(true);
    api.exportSalesReport.mockResolvedValue({
      blob: new Blob(['x']),
      filename: 'sales-spring-tour.csv',
    });
    URL.createObjectURL = vi.fn(() => 'blob:x');
    URL.revokeObjectURL = vi.fn();
    const names: string[] = [];
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      names.push(this.download);
    });
    render(
      <MemoryRouter>
        <SalesReport finance />
      </MemoryRouter>,
    );
    fireEvent.click(await screen.findByRole('button', { name: /export csv/i }));
    await waitFor(() => expect(names).toEqual(['sales-spring-tour.csv']));
    click.mockRestore();
  });

  it('shows money figures and exports to a finance member', async () => {
    load(true);
    render(
      <MemoryRouter>
        <SalesReport finance />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Net sales', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export csv/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /export pdf/i })).toBeInTheDocument();
    expect(screen.getByText(/provisional: some performances/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revenue' })).toBeInTheDocument();
  });

  it('shows ticket figures only to a member without finance', async () => {
    load(false);
    render(
      <MemoryRouter>
        <SalesReport finance={false} />
      </MemoryRouter>,
    );
    expect(await screen.findByText('Tickets sold', { selector: 'span' })).toBeInTheDocument();
    expect(screen.queryByText('Gross sales')).toBeNull();
    expect(screen.queryByText('Net sales', { selector: 'span' })).toBeNull();
    expect(screen.queryByRole('button', { name: /export/i })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revenue' })).toBeNull();
  });

  it('reports a refused request with the permission state', async () => {
    const { ApiClientError } = await import('../../api/client');
    api.getSalesSummary.mockRejectedValue(new ApiClientError('no', 403));
    api.getSalesTrend.mockResolvedValue(trend(false));
    api.getSalesBreakdown.mockResolvedValue(breakdown);
    render(
      <MemoryRouter>
        <SalesReport finance={false} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/hasn’t granted access/i);
  });

  it('validates a custom period next to the picker', async () => {
    load(false);
    render(
      <MemoryRouter initialEntries={['/?from=2026-12-09&to=2026-12-01']}>
        <SalesReport finance={false} />
      </MemoryRouter>,
    );
    expect(await screen.findByRole('alert')).toHaveTextContent(/on or before/i);
    expect(api.getSalesSummary).not.toHaveBeenCalled();
  });
});

describe('Overview sales', () => {
  beforeEach(() => vi.clearAllMocks());

  it('loads each section independently and hides money without finance', async () => {
    api.getSalesSummary.mockResolvedValue(summary(false));
    api.getSalesOnSale.mockRejectedValue(new Error('down'));
    api.getSalesUpcoming.mockResolvedValue([
      {
        performanceId: 'p1',
        eventId: 'e1',
        title: 'Next show',
        startsAt: '2026-12-02T12:00:00Z',
        netTickets: 4,
      },
    ]);
    render(
      <MemoryRouter>
        <OverviewSales finance={false} />
      </MemoryRouter>,
    );
    await waitFor(() => expect(screen.getAllByText(/10 tickets/).length).toBe(2));
    expect(screen.queryByText(/net$/)).toBeNull();
    expect(await screen.findByRole('alert')).toHaveTextContent(/could not load/i);
    expect(await screen.findByText('Next show')).toBeInTheDocument();
    expect(await screen.findByText(/3 of 10 checked in/)).toBeInTheDocument();
  });

  it('shows net and gross sales to a finance member', async () => {
    api.getSalesSummary.mockResolvedValue(summary(true));
    api.getSalesOnSale.mockResolvedValue([]);
    api.getSalesUpcoming.mockResolvedValue([]);
    render(
      <MemoryRouter>
        <OverviewSales finance />
      </MemoryRouter>,
    );
    expect((await screen.findAllByText(/net$/)).length).toBe(2);
    expect(await screen.findByText(/no performances are on sale/i)).toBeInTheDocument();
  });
});
