import { api, apiCommand, apiGet } from './client';
import { filenameFromDisposition } from './sales';

export type StatementScopeType = 'PERFORMANCE' | 'EVENT';

export type EligibleScope = {
  scopeType: StatementScopeType;
  scopeId: string;
  eventId: string;
  title: string;
  eventTitle: string;
  startsAt?: string;
  endsAt?: string;
  performanceCount: number;
  ticketsSold: number;
  netSales: number;
  statementId?: string;
  statementNumber?: string;
  statementRevision?: number;
  outOfDate: boolean;
};

export type StatementLine = {
  kind: 'PERFORMANCE' | 'OFFER' | 'PROVIDER';
  sort: number;
  label: string;
  provider?: string;
  ticketsSold: number;
  ticketsRefunded: number;
  grossSales: number;
  refunds: number;
  netSales: number;
  verifiedCollected: number;
  verifiedRefunded: number;
  saleOrders: number;
  refundOrders: number;
};

export type Statement = {
  id: string;
  scopeType: StatementScopeType;
  scopeId: string;
  eventId: string;
  number: string;
  revision: number;
  supersedesNumber?: string;
  supersededByNumber?: string;
  status: 'CURRENT' | 'SUPERSEDED';
  timezone: string;
  cutoffAt: string;
  issuedAt: string;
  organization: {
    displayName: string;
    legalName?: string;
    taxCode?: string;
    billingAddress?: string;
    logoIncluded: boolean;
  };
  scope: { title: string; eventTitle?: string; performanceCount: number };
  totals: {
    grossSales: number;
    refunds: number;
    netSales: number;
    saleOrders: number;
    refundOrders: number;
    ticketsSold: number;
    ticketsRefunded: number;
    verifiedCollected: number;
    verifiedRefunded: number;
    unreconciledOrders: number;
  };
  lines: StatementLine[];
  outOfDate: boolean;
};

export type StatementPage<T> = { content: T[]; page: number; size: number; hasMore: boolean };

const base = '/api/organizer/statements';

export function getEligibleStatements(search: string | undefined, page = 0, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), size: '20' });
  if (search) params.set('q', search);
  return apiGet<StatementPage<EligibleScope>>(`${base}/eligible?${params}`, signal);
}

export function getStatements(eventId: string | undefined, page = 0, signal?: AbortSignal) {
  const params = new URLSearchParams({ page: String(page), size: '20' });
  if (eventId) params.set('eventId', eventId);
  return apiGet<StatementPage<Statement>>(`${base}?${params}`, signal);
}

export function getStatement(id: string, signal?: AbortSignal) {
  return apiGet<Statement>(`${base}/${encodeURIComponent(id)}`, signal);
}

export type IssueResult = { statement: Statement; logoOmitted: boolean };

/** expectedRevision is 0 for the first statement of a scope, otherwise the revision being replaced. */
export function issueStatement(
  scopeType: StatementScopeType,
  scopeId: string,
  expectedRevision: number,
) {
  return apiCommand<IssueResult>('POST', base, { scopeType, scopeId, expectedRevision });
}

export async function downloadStatement(
  id: string,
  format: 'pdf' | 'csv',
  signal?: AbortSignal,
): Promise<{ blob: Blob; filename?: string }> {
  const response = await api.get<unknown, { data: Blob; headers: Record<string, unknown> }>(
    `${base}/${encodeURIComponent(id)}/download?format=${format}`,
    { responseType: 'blob', includeHeaders: true, signal },
  );
  return {
    blob: response.data,
    filename: filenameFromDisposition(response.headers?.['content-disposition']),
  };
}
