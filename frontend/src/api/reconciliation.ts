import { api, apiGet } from './client';
import type { ManagementApiScope } from './admin';

export type ReconciliationFilters = {
  from: string;
  to: string;
  basis: 'ATTEMPT' | 'COLLECTION';
  organizationId: string;
  concertId: string;
  unattributed: boolean;
};

export type ReconciliationRow = {
  intentId: string;
  orderId: string;
  organizationId: string | null;
  concertTitle: string | null;
  provider: string;
  paymentState: string;
  orderStatus: string | null;
  requestedAmount: number;
  transactionId: string | null;
  collectedAmount: number | null;
  attemptedAt: string;
  verifiedAt: string | null;
  refundAmount: number | null;
  refundReference: string | null;
  receivedAt: string | null;
};

export type ReconciliationReport = {
  content: ReconciliationRow[];
  totals: {
    transactions: number;
    paidOrderSales: number;
    verifiedCollections: number;
    missingSnapshots: number;
    latestSnapshot: string | null;
  };
  page: number;
  size: number;
};

function query(scope: ManagementApiScope, filter: ReconciliationFilters) {
  const params = new URLSearchParams({ from: filter.from, to: filter.to, basis: filter.basis });
  if (filter.concertId) params.set('concertId', filter.concertId);
  if (scope === 'admin') {
    if (filter.unattributed) params.set('unattributed', 'true');
    else if (filter.organizationId) params.set('organizationId', filter.organizationId);
  }
  return params;
}

export function getReconciliation(scope: ManagementApiScope, filter: ReconciliationFilters, page: number, signal?: AbortSignal) {
  const params = query(scope, filter);
  params.set('page', String(page));
  return apiGet<ReconciliationReport>(`/api/${scope}/reconciliation?${params}`, signal);
}

export function downloadReconciliation(scope: ManagementApiScope, filter: ReconciliationFilters) {
  return api.get<unknown, Blob>(`/api/${scope}/reconciliation/export?${query(scope, filter)}`, { responseType: 'blob' });
}
