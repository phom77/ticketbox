import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as admin from '../../api/admin';
import { ToastProvider } from '../../components/feedback/ToastProvider';
import { AdminGuestImportsPage } from './AdminGuestImportsPage';

vi.mock('../../api/admin');

const concertId = 'c0ffee00-0000-4000-8000-000000000001';

function batch(overrides: Partial<admin.BatchLog> = {}): admin.BatchLog {
  return {
    id: 'b1',
    jobName: 'guest-import',
    concertId,
    source: 'UPLOAD',
    fileName: 'vip-guests.csv',
    checksum: 'abc123',
    status: 'SUCCESS',
    startedAt: '2026-11-20T03:00:00Z',
    completedAt: '2026-11-20T03:01:05Z',
    totalRows: 3,
    successRows: 2,
    errorRows: 1,
    errorDetail: null,
    filePath: '/data/vip-guests.csv',
    errorReportPath: null,
    ...overrides,
  };
}

const page = (content: admin.BatchLog[]) => ({
  content,
  totalPages: 1,
  totalElements: content.length,
  number: 0,
  size: 20,
  first: true,
  last: true,
  empty: !content.length,
});

const guestPage = {
  content: [
    {
      id: 'g1',
      fullName: 'Lan Nguyen',
      phone: '0900000001',
      category: 'VIP',
      sponsorName: 'Acme',
      active: true,
      checkedInAt: null,
    },
  ],
  totalElements: 1,
  totalPages: 1,
  number: 0,
  last: true,
};

function renderPage(path = '/admin/guests') {
  return render(
    <ToastProvider>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/admin/guests" element={<AdminGuestImportsPage />} />
        </Routes>
      </MemoryRouter>
    </ToastProvider>,
  );
}

function csv(name = 'guests.csv', content = 'name,phone\nLan,0900000001') {
  return new File([content], name, { type: 'text/csv' });
}

beforeEach(() => {
  Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
  vi.mocked(admin.getAdminConcerts).mockResolvedValue(
    page([{ id: concertId, title: 'Autumn Jazz Night' }] as never) as never,
  );
  vi.mocked(admin.getBatchLogs).mockResolvedValue(page([batch()]) as never);
  vi.mocked(admin.getBatchLog).mockResolvedValue(batch());
  vi.mocked(admin.getConcertGuestList).mockResolvedValue(guestPage as never);
  vi.mocked(admin.importGuestList).mockResolvedValue({ data: { batchLogId: 'b2' } } as never);
});

afterEach(() => {
  vi.useRealTimers();
});

describe('AdminGuestImportsPage', () => {
  it('lists batches with their concert, source and result', async () => {
    renderPage();

    const row = (await screen.findByText('vip-guests.csv')).closest('tr')!;
    await waitFor(() => expect(within(row).getByText('Autumn Jazz Night')).toBeInTheDocument());
    expect(within(row).getByText('Uploaded manually.')).toBeInTheDocument();
    expect(within(row).getByText('Successful')).toBeInTheDocument();
    expect(admin.getBatchLogs).toHaveBeenCalledWith(
      { page: 0, size: 20, concertId: undefined, status: undefined, source: undefined },
      expect.anything(),
      'admin',
    );
  });

  it('reads filters from the address and clears them', async () => {
    const user = userEvent.setup();
    renderPage(`/admin/guests?status=FAILED&concertId=${concertId}`);

    await waitFor(() =>
      expect(admin.getBatchLogs).toHaveBeenCalledWith(
        { page: 0, size: 20, concertId, status: 'FAILED', source: undefined },
        expect.anything(),
        'admin',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() =>
      expect(admin.getBatchLogs).toHaveBeenLastCalledWith(
        { page: 0, size: 20, concertId: undefined, status: undefined, source: undefined },
        expect.anything(),
        'admin',
      ),
    );
  });

  it('rejects files that are not CSV or are empty', async () => {
    renderPage();
    const input = (await screen.findByText('Choose CSV file')).parentElement!.querySelector(
      'input[type="file"]',
    )!;

    fireEvent.change(input, { target: { files: [new File(['x'], 'guests.xlsx')] } });
    expect(await screen.findByText('Only accept files in .csv format.')).toBeInTheDocument();

    fireEvent.change(input, { target: { files: [csv('empty.csv', '')] } });
    expect(await screen.findByText('CSV files are not allowed to be empty.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Start importing' })).toBeDisabled();
  });

  it('uploads a CSV and opens the finished batch with its guests', async () => {
    const user = userEvent.setup();
    vi.mocked(admin.getBatchLog).mockResolvedValue(batch({ id: 'b2', fileName: 'guests.csv' }));
    renderPage();
    await screen.findByText('vip-guests.csv');
    const input = screen.getByText('Choose CSV file').parentElement!.querySelector('input')!;

    fireEvent.change(input, { target: { files: [csv()] } });
    await user.click(screen.getByRole('button', { name: 'Start importing' }));

    await waitFor(() =>
      expect(admin.importGuestList).toHaveBeenCalledWith(
        concertId,
        expect.any(File),
        'admin',
        false,
      ),
    );
    expect(await screen.findByText('Received the CSV file for processing.')).toBeInTheDocument();
    const dialog = await screen.findByRole('dialog', { name: 'guests.csv' });
    expect(await within(dialog).findByText('Lan Nguyen')).toBeInTheDocument();
    expect(within(dialog).getByText('Total flow').nextElementSibling).toHaveTextContent('3');
  });

  it('opens a batch from the history and closes it with Escape', async () => {
    const user = userEvent.setup();
    renderPage();

    await user.click(
      await screen.findByRole('button', { name: 'View details for vip-guests.csv' }),
    );
    const dialog = await screen.findByRole('dialog', { name: 'vip-guests.csv' });
    expect(await within(dialog).findByText('Lan Nguyen')).toBeInTheDocument();
    expect(within(dialog).getByText('/data/vip-guests.csv')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('polls a running batch until it finishes, then loads its guests', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const running = batch({
      id: 'b2',
      fileName: 'guests.csv',
      status: 'RUNNING',
      completedAt: null,
    });
    vi.mocked(admin.getBatchLog)
      .mockResolvedValueOnce(running)
      .mockResolvedValue(batch({ id: 'b2', fileName: 'guests.csv' }));
    renderPage();
    await screen.findByText('vip-guests.csv');
    fireEvent.change(screen.getByText('Choose CSV file').parentElement!.querySelector('input')!, {
      target: { files: [csv()] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Start importing' }));

    const dialog = await screen.findByRole('dialog', { name: 'guests.csv' });
    expect(admin.getConcertGuestList).not.toHaveBeenCalled();

    await act(() => vi.advanceTimersByTimeAsync(3100));
    expect(await within(dialog).findByText('Lan Nguyen')).toBeInTheDocument();
    expect(admin.getBatchLog).toHaveBeenCalledTimes(2);
  });
});
