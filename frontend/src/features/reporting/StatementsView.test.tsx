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
    expect(screen.getByRole('link', { name: 'Open reconciliation' })).toHaveAttribute(
      'href',
      '/organizer/reports?view=reconciliation&concertId=p1',
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
});
