import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as admin from '../../api/admin';
import { ToastProvider } from '../../components/feedback/ToastProvider';
import { ConcertWorkspacePage } from './ConcertWorkspacePage';

vi.mock('../../api/admin');
vi.mock('../../api/publication', () => ({
  getPublication: vi.fn().mockResolvedValue({ draftEdit: false }),
}));
vi.mock('../../features/organizations/PublicationPanel', () => ({
  PublicationPanel: () => <div>Publication panel</div>,
}));
vi.mock('./EventDisruptionPanel', () => ({
  EventDisruptionPanel: () => <div>Disruption panel</div>,
}));

const concertId = 'c0ffee00-0000-4000-8000-000000000001';

const concert = {
  id: concertId,
  title: 'Autumn Jazz Night',
  venueName: 'Hanoi Opera House',
  venueAddress: '1 Trang Tien',
  eventDate: '2026-12-20T12:00:00Z',
  doorsOpenAt: null,
  saleStartAt: '2026-12-01T03:00:00Z',
  saleEndAt: null,
  status: 'ON_SALE',
  posterUrl: null,
  description: 'An evening of jazz',
  artistBio: null,
  seatMapSvg: null,
  createdBy: 'organizer',
  createdAt: '2026-11-01T00:00:00Z',
  updatedAt: '2026-11-02T00:00:00Z',
  ticketTypes: [
    {
      id: 't1',
      name: 'Standard',
      price: 500_000,
      totalQuantity: 60,
      availableQty: 25,
      isActive: true,
    },
    {
      id: 't2',
      name: 'VIP',
      price: 1_500_000,
      totalQuantity: 40,
      availableQty: 15,
      isActive: false,
    },
  ],
};

const guests = (names: string[], page = 0, totalPages = 1) => ({
  content: names.map((fullName, index) => ({
    id: `g${page}-${index}`,
    fullName,
    phone: '0900000000',
    category: 'VIP',
    sponsorName: null,
    active: true,
    checkedInAt: null,
    checkinGate: null,
    notes: null,
  })),
  totalElements: 21,
  totalPages,
  number: page,
  last: page + 1 >= totalPages,
});

function renderWorkspace(path = `/admin/concerts/${concertId}`) {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/concerts/:id" element={<ConcertWorkspacePage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

const tab = (name: string) =>
  within(screen.getByRole('navigation', { name: /./ })).getByRole('button', { name });

beforeEach(() => {
  vi.mocked(admin.getManagedConcert).mockResolvedValue(concert as never);
  vi.mocked(admin.getConcertGuestList).mockImplementation((_id, page) =>
    Promise.resolve(
      guests(page === 0 ? ['Lan Nguyen', 'Minh Tran'] : ['Hoa Le'], page, 2) as never,
    ),
  );
  vi.mocked(admin.getAdminOrders).mockResolvedValue([
    { id: 'o1', status: 'PAID', totalAmount: 500_000 },
    { id: 'o2', status: 'PAID', totalAmount: 1_500_000 },
    { id: 'o3', status: 'AWAITING_PAYMENT', totalAmount: 500_000 },
  ] as never);
  vi.mocked(admin.getManagedCheckinSummary).mockResolvedValue({
    totalTickets: 60,
    checkedIn: 5,
    onlineCheckins: 4,
    offlineCheckins: 1,
  } as never);
  vi.mocked(admin.getArtistBioJobs).mockResolvedValue({
    content: [
      {
        id: 'j1',
        concertId,
        originalFileName: 'press-kit.pdf',
        status: 'DONE',
        resultBio: 'A quartet from Hanoi.',
        createdAt: '2026-11-03T00:00:00Z',
      },
    ],
  } as never);
  vi.mocked(admin.updateConcert).mockImplementation((_id, payload) =>
    Promise.resolve({ data: { ...concert, ...payload } } as never),
  );
  vi.mocked(admin.publishConcertArtistBio).mockResolvedValue({} as never);
});

describe('ConcertWorkspacePage', () => {
  it('summarizes tickets, guests, revenue and check-in on the overview', async () => {
    renderWorkspace();

    expect(await screen.findByRole('heading', { name: 'Autumn Jazz Night' })).toBeInTheDocument();
    const metric = (label: string) => screen.getByRole('button', { name: new RegExp(label) });
    expect(metric('Tickets are available')).toHaveTextContent('40 / 100');
    await waitFor(() => expect(metric('Guests with filters')).toHaveTextContent('21'));
    await waitFor(() => expect(metric('Revenue paid off')).toHaveTextContent(/2,000,000/));
    expect(metric('Check in now.')).toHaveTextContent('5 / 60');
    expect(screen.getByText('Publication panel')).toBeInTheDocument();
  });

  it('filters and pages guests, and keeps the filter when switching tabs', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: 'Guests' }));

    expect(await screen.findByText('Lan Nguyen')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '21 matching guests' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Next page' }));
    expect(await screen.findByText('Hoa Le')).toBeInTheDocument();

    const search = screen.getByPlaceholderText('Find the name, phone number, class or unit...');
    fireEvent.change(search, { target: { value: 'lan' } });
    await waitFor(() =>
      expect(admin.getConcertGuestList).toHaveBeenLastCalledWith(
        concertId,
        0,
        20,
        expect.anything(),
        'admin',
        { query: 'lan', activeOnly: false },
      ),
    );

    await user.click(tab('Overview'));
    await user.click(tab('Guests'));
    expect(
      screen.getByPlaceholderText('Find the name, phone number, class or unit...'),
    ).toHaveValue('lan');
  });

  it('saves edited details through the management API', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: 'News & calendar' }));

    const venue = screen.getByRole('textbox', { name: 'Venue' });
    await user.clear(venue);
    await user.type(venue, '  Saigon Opera House  ');
    await user.click(screen.getByRole('button', { name: 'Configuration savings' }));

    await waitFor(() => expect(admin.updateConcert).toHaveBeenCalledOnce());
    const [id, payload, scope] = vi.mocked(admin.updateConcert).mock.calls[0];
    expect(id).toBe(concertId);
    expect(scope).toBe('admin');
    expect(payload).toMatchObject({
      venueName: 'Saigon Opera House',
      eventDate: concert.eventDate,
      saleStartAt: concert.saleStartAt,
    });
    expect(await screen.findByText('I saved the concert setup.')).toBeInTheDocument();
  });

  it('shows order and check-in counts on the operations tab', async () => {
    const user = userEvent.setup();
    renderWorkspace();
    await user.click(await screen.findByRole('button', { name: 'Orders and check-in' }));

    const paid = await screen.findByText('Paid for.');
    expect(paid.nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Waiting for payment').nextElementSibling).toHaveTextContent('1');
    expect(screen.getByText('Online / Offline').nextElementSibling).toHaveTextContent('4 / 1');
    expect(screen.getByText('Disruption panel')).toBeInTheDocument();
  });

  it('drafts and publishes the artist biography from a source', async () => {
    const user = userEvent.setup();
    renderWorkspace(`/admin/concerts/${concertId}?tab=artist`);

    expect(await screen.findByText('press-kit.pdf')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'See for yourself.' }));
    expect(screen.getByRole('textbox')).toHaveValue('A quartet from Hanoi.');

    await user.click(screen.getByRole('button', { name: 'Published on the concert page' }));
    await waitFor(() =>
      expect(admin.publishConcertArtistBio).toHaveBeenCalledWith(
        concertId,
        'A quartet from Hanoi.',
        'admin',
      ),
    );
    expect(
      await screen.findByText("Published the artist's content on the public concert page."),
    ).toBeInTheDocument();
  });
});
