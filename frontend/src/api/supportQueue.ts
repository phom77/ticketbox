import { api, apiGet } from './client';

export type SupportQueueKind = 'UNKNOWN_PAYMENT' | 'MISSING_TICKETS' | 'PENDING_REFUND' | 'FAILED_EMAIL';

export type SupportQueueItem = {
  orderId: string;
  sourceId: string;
  state: string;
  updatedAt: string;
  retryable: boolean;
};

export type SupportQueuePage = {
  content: SupportQueueItem[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export function getSupportQueue(kind: SupportQueueKind, page: number, signal: AbortSignal) {
  const query = new URLSearchParams({ kind, page: String(page), size: '10' });
  return apiGet<SupportQueuePage>(`/api/admin/orders/support/queue?${query}`, signal);
}

export function retrySupportItem(kind: 'UNKNOWN_PAYMENT' | 'FAILED_EMAIL', item: SupportQueueItem, actionId: string) {
  if (kind === 'UNKNOWN_PAYMENT') {
    return api.post(`/api/admin/payment-workflows/${encodeURIComponent(item.orderId)}/review`, {
      actionId,
      action: 'REDRIVE_QUERY',
      detail: 'Kiểm tra lại giao dịch từ hàng đợi hỗ trợ',
    });
  }
  return api.post(`/api/admin/notifications/${encodeURIComponent(item.sourceId)}/retry`, undefined, {
    headers: { 'Idempotency-Key': actionId },
  });
}
