import { render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as operations from '../../api/operations';
import { ConcertDirectoryPage } from './ConcertDirectoryPage';

vi.mock('../../api/operations');
vi.mock('../../api/organizations', () => ({ getApprovedOrganizations: vi.fn() }));

const row = (overrides: Partial<operations.OperationsEventRow>): operations.OperationsEventRow => ({
  id: 'e1',
  title: 'Night of jazz',
  description: null,
  category: null,
  organizationId: 'o1',
  legacyConcertId: null,
  performanceCount: 2,
  preparing: false,
  changesRequested: false,
  nextStartsAt: '2030-05-10T12:00:00Z',
  actionPerformanceId: null,
  changeReason: null,
  posterUrl: null,
  status: 'ON_SALE',
  contentChangeInReview: false,
  ...overrides,
});

function renderDirectory(rows: operations.OperationsEventRow[], search = '') {
  vi.mocked(operations.getOperationsEvents).mockResolvedValue({
    content: rows,
    totalElements: rows.length,
    totalPages: 1,
    number: 0,
    size: 20,
  });
  return render(
    <MemoryRouter initialEntries={['/organizer/events' + search]}>
      <ConcertDirectoryPage scope="organizer" />
    </MemoryRouter>,
  );
}

beforeEach(() => vi.resetAllMocks());

describe('organizer event directory', () => {
  it('shows poster, rolled-up status, performance count, badge and row actions', async () => {
    renderDirectory([
      row({ posterUrl: 'https://cdn.test/p.png', contentChangeInReview: true }),
      row({
        id: 'e2',
        title: 'Quiet draft',
        status: 'DRAFT',
        performanceCount: 0,
        nextStartsAt: null,
      }),
    ]);
    const first = (await screen.findByText('Night of jazz')).closest('tr')!;
    expect(first.querySelector('img')).toHaveAttribute('src', 'https://cdn.test/p.png');
    expect(within(first).getByText('On sale')).toBeInTheDocument();
    expect(within(first).getByText('Content change in review')).toBeInTheDocument();
    expect(within(first).getByRole('link', { name: 'Preview' })).toHaveAttribute(
      'href',
      '/organizer/events/e1/preview',
    );
    expect(within(first).getByRole('link', { name: 'Report' })).toHaveAttribute(
      'href',
      '/organizer/reports?eventId=e1',
    );
    const second = screen.getByText('Quiet draft').closest('tr')!;
    expect(within(second).getByText('Draft')).toBeInTheDocument();
    expect(within(second).queryByText('Content change in review')).not.toBeInTheDocument();
  });

  it('opens a legacy concert in the event workspace and reports by concert id', async () => {
    renderDirectory([
      row({ id: 'c1', title: 'Old concert', legacyConcertId: 'c1', status: 'PAST' }),
    ]);
    const legacy = (await screen.findByText('Old concert')).closest('tr')!;
    const [title] = within(legacy).getAllByRole('link', { name: 'Old concert' });
    expect(title).toHaveAttribute('href', '/organizer/events/c1');
    expect(within(legacy).getByRole('link', { name: 'Report' })).toHaveAttribute(
      'href',
      '/organizer/reports?concertId=c1',
    );
  });

  it('asks the API for the chosen status', async () => {
    renderDirectory([], '?status=IN_REVIEW');
    await waitFor(() => expect(operations.getOperationsEvents).toHaveBeenCalled());
    expect(operations.getOperationsEvents).toHaveBeenCalledWith(
      'organizer',
      expect.objectContaining({ status: 'IN_REVIEW' }),
      expect.anything(),
    );
  });
});
