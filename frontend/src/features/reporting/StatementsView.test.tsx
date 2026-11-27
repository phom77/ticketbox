import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EligibleScope, Statement } from '../../api/statements';
import { StatementsView } from './StatementsView';

const statements = vi.hoisted(() => ({
  getEligibleStatements: vi.fn(),
  getStatements: vi.fn(),
  issueStatement: vi.fn(),
  downloadStatement: vi.fn(),
}));
vi.mock('../../api/statements', () => statements);
vi.mock('../../api/sales', () => ({
  getSalesEvents: vi.fn().mockResolvedValue({ content: [], page: 0, size: 20, hasMore: false }),
}));
const profiles = vi.hoisted(() => ({ getOrganizationProfile: vi.fn() }));
vi.mock('../../api/organizationProfile', () => profiles);
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));
vi.mock('../../components/feedback/toast-context', () => ({ useToast: () => toast }));
vi.mock('../organizations/OrganizationProvider', () => ({
  useOrganization: () => ({ selected: { id: 'org-1', name: 'Dawn', grants: ['FINANCE'] } }),
}));

const ready = (changes: Partial<EligibleScope> = {}): EligibleScope => ({
  scopeType: 'PERFORMANCE',
  scopeId: 'p1',
  eventId: 'e1',
  title: 'Opening night',
  eventTitle: 'Opening night',
  endsAt: '2026-12-02T15:00:00Z',
  performanceCount: 1,
  ticketsSold: 4,
  netSales: 400000,
  outOfDate: false,
  detailsChanged: false,
  ...changes,
});

const issued = (changes: Partial<Statement> = {}): Statement => ({
  id: 's1',
  scopeType: 'PERFORMANCE',
  scopeId: 'p1',
  eventId: 'e1',
  number: 'TBS-2026-000001',
  revision: 1,
  status: 'CURRENT',
  timezone: 'Asia/Ho_Chi_Minh',
  cutoffAt: '2026-12-03T00:00:00Z',
  issuedAt: '2026-12-03T00:00:00Z',
  organization: { displayName: 'Dawn', logoIncluded: false },
  scope: { title: 'Opening night', performanceCount: 1 },
  totals: {
    grossSales: 400000,
    refunds: 0,
    netSales: 400000,
    saleOrders: 2,
    refundOrders: 0,
    ticketsSold: 4,
    ticketsRefunded: 0,
    verifiedCollected: 400000,
    verifiedRefunded: 0,
    unreconciledOrders: 1,
  },
  lines: [],
  outOfDate: false,
  detailsChanged: false,
  ...changes,
});

const page = <T,>(content: T[]) => ({ content, page: 0, size: 20, hasMore: false });

function open() {
  render(
    <MemoryRouter>
      <StatementsView />
    </MemoryRouter>,
  );
}

describe('StatementsView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    statements.getEligibleStatements.mockResolvedValue(page([ready()]));
    statements.getStatements.mockResolvedValue(page([]));
    profiles.getOrganizationProfile.mockResolvedValue({
      displayName: 'Dawn',
      reportingTimezone: 'UTC',
    });
  });

  it('warns about missing statement details in the confirmation and still allows issue', async () => {
    statements.issueStatement.mockResolvedValue({
      data: { statement: issued(), logoOmitted: false },
    });
    open();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Issue a statement for Opening night' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('legal name or tax code is missing');
    expect(screen.getByRole('link', { name: 'Open settings' })).toHaveAttribute(
      'href',
      '/organizer/settings',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Issue statement' }));
    await waitFor(() =>
      expect(statements.issueStatement).toHaveBeenCalledWith('PERFORMANCE', 'p1', 0),
    );
    expect(toast.success).toHaveBeenCalled();
  });

  it('offers a re-issue for an out-of-date statement and sends the revision it replaces', async () => {
    statements.getEligibleStatements.mockResolvedValue(
      page([
        ready({
          statementId: 's1',
          statementNumber: 'TBS-2026-000001',
          statementRevision: 1,
          outOfDate: true,
        }),
      ]),
    );
    statements.getStatements.mockResolvedValue(page([issued({ outOfDate: true })]));
    statements.issueStatement.mockResolvedValue({
      data: { statement: issued({ revision: 2 }), logoOmitted: true },
    });
    open();
    expect(await screen.findAllByText(/Out of date/)).not.toHaveLength(0);
    expect(screen.getByText(/1 order not yet reconciled/)).toBeVisible();
    expect(screen.getByRole('link', { name: 'Open reconciliation' }).getAttribute('href')).toMatch(
      /^\/organizer\/reports\?view=reconciliation&concertId=p1&from=\d{4}-\d{2}-\d{2}&to=\d{4}-\d{2}-\d{2}$/,
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Re-issue the statement for Opening night' }),
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Issue new revision' }));
    await waitFor(() =>
      expect(statements.issueStatement).toHaveBeenCalledWith('PERFORMANCE', 'p1', 1),
    );
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('without it'));
  });

  it('labels superseded statements and keeps them downloadable', async () => {
    statements.getEligibleStatements.mockResolvedValue(page([]));
    statements.getStatements.mockResolvedValue(
      page([issued({ status: 'SUPERSEDED', supersededByNumber: 'TBS-2026-000001-R2' })]),
    );
    open();
    expect(await screen.findByText('Superseded by TBS-2026-000001-R2')).toBeVisible();
    expect(screen.getByText(/Nothing is ready for a statement/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Download PDF of TBS-2026-000001' })).toBeEnabled();
    expect(screen.getByRole('button', { name: 'Download CSV of TBS-2026-000001' })).toBeEnabled();
    expect(screen.queryByRole('button', { name: 'Re-issue' })).toBeNull();
  });

  it('filters the reconciliation link of an event statement by the event', async () => {
    statements.getEligibleStatements.mockResolvedValue(page([]));
    statements.getStatements.mockResolvedValue(
      page([issued({ scopeType: 'EVENT', scopeId: 'e1' })]),
    );
    open();
    const link = await screen.findByRole('link', { name: 'Open reconciliation' });
    expect(link.getAttribute('href')).toContain('view=reconciliation&eventId=e1&from=');
  });

  it('offers a re-issue when only the organization details changed', async () => {
    statements.getEligibleStatements.mockResolvedValue(page([]));
    statements.getStatements.mockResolvedValue(page([issued({ detailsChanged: true })]));
    statements.issueStatement.mockResolvedValue({
      data: { statement: issued({ revision: 2 }), logoOmitted: false },
    });
    open();
    expect(await screen.findByText('Details changed since issue')).toBeVisible();
    expect(screen.queryByText(/Out of date/)).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Re-issue' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Issue new revision' }));
    await waitFor(() =>
      expect(statements.issueStatement).toHaveBeenCalledWith('PERFORMANCE', 'p1', 1),
    );
  });

  it('does not allow confirming while the organization details are loading or failed', async () => {
    profiles.getOrganizationProfile.mockRejectedValueOnce(new Error('offline'));
    open();
    fireEvent.click(
      await screen.findByRole('button', { name: 'Issue a statement for Opening night' }),
    );
    expect(await screen.findByRole('alert')).toHaveTextContent('could not be loaded');
    expect(screen.getByRole('button', { name: 'Issue statement' })).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Issue statement' })).toBeEnabled(),
    );
    expect(statements.issueStatement).not.toHaveBeenCalled();
  });

  it('pages through the scopes that are ready and returns focus to the opener', async () => {
    statements.getEligibleStatements.mockImplementation((_q: string | undefined, index: number) =>
      Promise.resolve({
        content: [ready({ scopeId: 'p' + index, title: 'Show ' + index })],
        page: index,
        size: 20,
        hasMore: index === 0,
      }),
    );
    open();
    expect(await screen.findByText('Show 0')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('Show 1')).toBeVisible();
    expect(statements.getEligibleStatements).toHaveBeenLastCalledWith(
      undefined,
      1,
      expect.anything(),
    );
    const opener = screen.getByRole('button', { name: 'Issue a statement for Show 1' });
    opener.focus();
    fireEvent.click(opener);
    const cancel = await screen.findByRole('button', { name: 'Cancel' });
    await waitFor(() => expect(cancel).toHaveFocus());
    fireEvent.keyDown(cancel, { key: 'Escape' });
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
