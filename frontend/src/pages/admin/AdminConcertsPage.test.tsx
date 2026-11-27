import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as admin from '../../api/admin';
import type { ManagementApiScope } from '../../api/admin';
import * as organizations from '../../api/organizations';
import { ToastProvider } from '../../components/feedback/ToastProvider';
import { AdminConcertsPage } from './AdminConcertsPage';

vi.mock('../../api/admin');
vi.mock('../../api/organizations');

const onSale = {
  id: 'c1',
  title: 'Autumn Jazz Night',
  venueName: 'Hanoi Opera House',
  venueAddress: '1 Trang Tien',
  eventDate: '2026-12-20T12:00:00Z',
  doorsOpenAt: null,
  saleStartAt: '2026-12-01T03:00:00Z',
  saleEndAt: null,
  status: 'ON_SALE',
  posterUrl: null,
  seatMapSvg: null,
  description: null,
};
const draft = { ...onSale, id: 'c2', title: 'Winter Strings', status: 'DRAFT' };

const page = (content: unknown[]) => ({
  content,
  totalPages: 1,
  totalElements: content.length,
  number: 0,
  size: 10,
  first: true,
  last: true,
  empty: !content.length,
});

function renderPage(path = '/admin/concerts', apiScope: ManagementApiScope = 'admin') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/concerts" element={<AdminConcertsPage apiScope={apiScope} />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

beforeEach(() => {
  vi.mocked(admin.getAdminConcerts).mockResolvedValue(page([onSale, draft]) as never);
  vi.mocked(admin.getAdminCheckinSummary).mockImplementation((concertId) =>
    Promise.resolve({
      concertId,
      totalTickets: 60,
      checkedIn: 5,
      onlineCheckins: 4,
      offlineCheckins: 1,
    } as never),
  );
  vi.mocked(admin.updateConcert).mockResolvedValue({ data: onSale } as never);
  vi.mocked(admin.getConcertCategory).mockResolvedValue({ category: 'family' } as never);
  vi.mocked(admin.setConcertCategory).mockResolvedValue({ data: { category: 'sports' } } as never);
  vi.mocked(admin.updateConcertStatus).mockResolvedValue({} as never);
  vi.mocked(admin.deleteConcert).mockResolvedValue({} as never);
  vi.mocked(organizations.getApprovedOrganizations).mockResolvedValue([
    { id: 'org1', name: 'Acme Live' },
  ] as never);
});

describe('AdminConcertsPage', () => {
  it('lists concerts with status and check-in progress, and searches from the first page', async () => {
    renderPage();

    const row = (await screen.findByText('Autumn Jazz Night')).closest('tr')!;
    expect(within(row).getByText('On sale')).toBeInTheDocument();
    await waitFor(() => expect(within(row).getByText(/5 \/\s*60/)).toBeInTheDocument());
    expect(screen.getByText('The right show.').nextElementSibling).toHaveTextContent('2');

    fireEvent.change(screen.getByPlaceholderText('Find the concert, the venue...'), {
      target: { value: 'jazz' },
    });
    await waitFor(() =>
      expect(admin.getAdminConcerts).toHaveBeenLastCalledWith(
        0,
        10,
        undefined,
        expect.anything(),
        'admin',
        'jazz',
      ),
    );
  });

  it('edits a concert and reloads the list', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit Autumn Jazz Night' }));
    const dialog = screen.getByRole('dialog', { name: 'Autumn Jazz Night' });
    const venue = within(dialog).getByRole('textbox', { name: 'Venue' });
    expect(venue).toHaveValue('Hanoi Opera House');
    await user.clear(venue);
    await user.type(venue, ' Saigon Opera House ');
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(admin.updateConcert).toHaveBeenCalledOnce());
    expect(vi.mocked(admin.updateConcert).mock.calls[0][1]).toMatchObject({
      venueName: 'Saigon Opera House',
      eventDate: '2026-12-20T12:00:00.000Z',
    });
    expect(await screen.findByText("I've updated the concert.")).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(admin.getAdminConcerts).toHaveBeenCalledTimes(2);
  });

  it('shows the mapped event category and saves a new one', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(await screen.findByRole('button', { name: 'Edit Autumn Jazz Night' }));
    const dialog = screen.getByRole('dialog', { name: 'Autumn Jazz Night' });
    const select = within(dialog).getByRole('combobox', { name: 'Category (optional)' });
    await waitFor(() => expect(select).toHaveTextContent('Family'));
    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'Sports' }));
    await user.click(within(dialog).getByRole('button', { name: 'Save changes' }));

    await waitFor(() =>
      expect(admin.setConcertCategory).toHaveBeenCalledWith('c1', 'sports', 'admin'),
    );
  });

  it('rejects a poster that is not JPEG, PNG or WebP', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(await screen.findByRole('button', { name: 'Edit Autumn Jazz Night' }));

    const input = screen.getByText('Pick the poster').querySelector('input')!;
    fireEvent.change(input, {
      target: { files: [new File(['gif'], 'p.gif', { type: 'image/gif' })] },
    });
    expect(
      await screen.findByText('Posters must be JPEG, PNG or WebP images.'),
    ).toBeInTheDocument();
  });

  it('moves a concert to its next status', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'Change status for Autumn Jazz Night' }),
    );
    expect(screen.getAllByRole('menuitem').map((item) => item.textContent)).toEqual([
      'Sold out',
      expect.any(String),
      'Cancelled',
    ]);
    await user.click(screen.getByRole('menuitem', { name: 'Sold out' }));

    await waitFor(() =>
      expect(admin.updateConcertStatus).toHaveBeenCalledWith('c1', 'SOLD_OUT', 'admin'),
    );
    expect(await screen.findByText('Changed “Autumn Jazz Night” to Sold out.')).toBeInTheDocument();
  });

  it('lets organizers move status but not cancel', async () => {
    const user = userEvent.setup();
    renderPage('/admin/concerts', 'organizer');

    await user.click(
      await screen.findByRole('button', { name: 'Change status for Autumn Jazz Night' }),
    );
    expect(screen.queryByRole('menuitem', { name: 'Cancelled' })).not.toBeInTheDocument();
  });

  it('deletes a draft after confirmation', async () => {
    const user = userEvent.setup();
    renderPage();

    expect(await screen.findByRole('button', { name: 'Delete Autumn Jazz Night' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Delete Winter Strings' }));
    const confirm = screen.getByRole('alertdialog', { name: 'Delete event “Winter Strings”?' });
    await user.click(within(confirm).getByRole('button', { name: 'Delete event' }));

    await waitFor(() => expect(admin.deleteConcert).toHaveBeenCalledWith('c2', 'admin'));
    expect(await screen.findByText('I canceled the concert.')).toBeInTheDocument();
  });

  it('opens the create form from a link with the requested owner', async () => {
    renderPage('/admin/concerts?create=1&organizationId=org1');

    const dialog = await screen.findByRole('dialog', { name: 'Create event' });
    await waitFor(() => expect(organizations.getApprovedOrganizations).toHaveBeenCalled());
    await waitFor(() =>
      expect(within(dialog).getByRole('button', { name: 'Create draft' })).toBeEnabled(),
    );
  });
});
