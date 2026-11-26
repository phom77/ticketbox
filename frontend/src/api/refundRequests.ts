import { apiCommand, apiGet } from './client';

export type RefundRequestStatus =
  | 'REQUESTED'
  | 'APPROVED'
  | 'REJECTED'
  | 'WITHDRAWN'
  | 'REFUNDED'
  | 'FAILED';
/** BUYER requests wait for the organizer; POSTPONEMENT requests go straight to a platform case. */
export type RefundRequestOrigin = 'BUYER' | 'POSTPONEMENT';
export type RefundBlocker =
  | 'NOT_PAID'
  | 'NO_TICKETS'
  | 'REQUEST_OPEN'
  | 'TICKET_USED'
  | 'TICKET_TRANSFERRED'
  | 'TRANSFER_PENDING'
  | 'REFUND_IN_PROGRESS'
  | 'CANCELLED'
  | 'EVENT_PASSED'
  | 'WINDOW_CLOSED';

export type RefundRequest = {
  id: string;
  orderId: string;
  status: RefundRequestStatus;
  origin: RefundRequestOrigin;
  reason: string;
  decisionNote?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  canWithdraw: boolean;
};

/** What the order page needs to show about refunding one order. */
export type RefundRequestState = {
  canRequest: boolean;
  blockedReason?: RefundBlocker | null;
  origin?: RefundRequestOrigin | null;
  deadline?: string | null;
  request?: RefundRequest | null;
};

export function getRefundRequestState(orderId: string, signal?: AbortSignal) {
  return apiGet<RefundRequestState>(
    `/api/orders/${encodeURIComponent(orderId)}/refund-request`,
    signal,
  );
}

export async function requestRefund(orderId: string, reason: string) {
  const result = await apiCommand<RefundRequest>(
    'POST',
    `/api/orders/${encodeURIComponent(orderId)}/refund-requests`,
    { reason },
  );
  return result.data;
}

export async function withdrawRefundRequest(orderId: string, requestId: string) {
  const result = await apiCommand<RefundRequest>(
    'POST',
    `/api/orders/${encodeURIComponent(orderId)}/refund-requests/${encodeURIComponent(requestId)}/withdraw`,
  );
  return result.data;
}

export type DisruptionNotice = {
  concertId: string;
  concertTitle: string;
  kind: 'CANCEL' | 'POSTPONE';
  newEventDate?: string | null;
};

export type RefundStage = 'PENDING' | 'APPROVED' | 'REFUNDED';

export type OptionsOrder = {
  orderId: string;
  referenceCode?: string | null;
  amount: number;
  status: string;
  refundStage: RefundStage;
  canRequest: boolean;
  blockedReason?: RefundBlocker | null;
  request?: RefundRequest | null;
};

export type EventOptions = { disruption: DisruptionNotice; orders: OptionsOrder[] };

export function getDisruptionNotices(signal?: AbortSignal) {
  return apiGet<DisruptionNotice[]>('/api/tickets/disruptions', signal);
}

export function getEventOptions(concertId: string, signal?: AbortSignal) {
  return apiGet<EventOptions>(
    `/api/tickets/events/${encodeURIComponent(concertId)}/options`,
    signal,
  );
}

/** A request in the organizer queue, with the order and event it belongs to. */
export type ManagedRefundRequest = {
  id: string;
  orderId: string;
  orderReference?: string | null;
  concertId: string;
  concertTitle: string;
  amount: number;
  status: RefundRequestStatus;
  origin: RefundRequestOrigin;
  reason: string;
  decisionNote?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  awaitingCase: boolean;
};

export type ManagedRefundRequestPage = {
  content: ManagedRefundRequest[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export function getOrganizerRefundRequests(
  statuses: RefundRequestStatus[],
  page: number,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ page: String(page), size: '20' });
  statuses.forEach((status) => query.append('status', status));
  return apiGet<ManagedRefundRequestPage>(`/api/organizer/manage/refund-requests?${query}`, signal);
}

export async function approveRefundRequest(id: string) {
  const result = await apiCommand<ManagedRefundRequest>(
    'POST',
    `/api/organizer/manage/refund-requests/${encodeURIComponent(id)}/approve`,
  );
  return result.data;
}

export async function rejectRefundRequest(id: string, note: string) {
  const result = await apiCommand<ManagedRefundRequest>(
    'POST',
    `/api/organizer/manage/refund-requests/${encodeURIComponent(id)}/reject`,
    { note },
  );
  return result.data;
}
