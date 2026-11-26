import { apiCommand, apiGet } from '../client';
import type { Page } from '../concerts';
import type { Order, OrderStatus } from '../orders';
import type { Ticket } from '../tickets';
import type { NotificationItem } from '../notifications';
import { managementBase } from './scope';
import type { ManagementApiScope } from './scope';

// ---- Admin Order & Ticket Management ----

export function getAdminOrders(
  params?: { concertId?: string; status?: OrderStatus },
  scope: ManagementApiScope = 'admin',
  signal?: AbortSignal,
) {
  const query = new URLSearchParams();
  if (params?.concertId) query.set('concertId', params.concertId);
  if (params?.status) query.set('status', params.status);
  const qs = query.toString();
  return apiGet<Order[]>(`${managementBase(scope)}/orders${qs ? `?${qs}` : ''}`, signal);
}

export type OrderSupportLookup = {
  field: 'referenceCode' | 'orderId' | 'buyerEmail' | 'transactionRef';
  value: string;
};

export type OrderSupportPage = Pick<
  Page<Order>,
  'content' | 'size' | 'totalElements' | 'totalPages'
> & {
  page: number;
};

export function searchAdminOrders(
  lookup: OrderSupportLookup,
  options: { page: number; size: number; concertId?: string },
  scope: ManagementApiScope,
  signal?: AbortSignal,
) {
  const query = new URLSearchParams({ [lookup.field]: lookup.value });
  if (options.concertId) query.set('concertId', options.concertId);
  query.set('page', String(options.page));
  query.set('size', String(options.size));
  return apiGet<OrderSupportPage>(`${managementBase(scope)}/orders/support?${query}`, signal);
}

export type OrderSupportDetails = {
  tickets: Array<Pick<Ticket, 'id' | 'referenceCode' | 'status' | 'issuedAt'>>;
  payment: {
    attempt: {
      state: string;
      provider: string;
      requestedAmount: number;
      transactionId: string | null;
      verifiedAt: string | null;
    } | null;
    cases: RefundReview[];
  };
  delivery: Array<{ id: string; status: NotificationItem['status']; updatedAt: string }>;
};

export type RefundReview = {
  id: string;
  state: string;
  amount: number;
  externalReference: string | null;
  recordedAt: string | null;
  requestedBy: string | null;
  approvedBy: string | null;
  /** Set when the case was opened from a buyer refund request; absent for operator cases. */
  origin?: 'BUYER' | 'POSTPONEMENT' | null;
  refundRequestId?: string | null;
};

export type RefundDecision = 'REQUEST' | 'APPROVE' | 'CONFIRM' | 'ABORT';

export type RefundCommand = {
  actionId: string;
  caseId?: string;
  action: RefundDecision;
  detail: string;
  amount?: number;
  externalReference?: string;
  occurredAt?: string;
};

export type RefundCase = Omit<RefundReview, 'recordedAt'> & {
  orderId: string;
  provider: string;
  transactionId: string;
  occurredAt: string | null;
  compensation: boolean;
};

export function decideOrderRefund(orderId: string, command: RefundCommand) {
  return apiCommand<RefundCase>(
    'post',
    `/api/admin/orders/${encodeURIComponent(orderId)}/refunds`,
    command,
  );
}

export function getOrderSupportSection<K extends keyof OrderSupportDetails>(
  orderId: string,
  section: K,
  scope: ManagementApiScope,
  signal: AbortSignal,
) {
  return apiGet<OrderSupportDetails[K]>(
    `${managementBase(scope)}/orders/${encodeURIComponent(orderId)}/support/${section}`,
    signal,
  );
}

export function getAdminOrderDetail(orderId: string, scope: ManagementApiScope = 'admin') {
  return apiGet<Order>(`${managementBase(scope)}/orders/${encodeURIComponent(orderId)}`);
}

export function getAdminConcertTickets(
  concertId: string,
  status?: string,
  scope: ManagementApiScope = 'admin',
) {
  const qs = status ? `?status=${encodeURIComponent(status)}` : '';
  return apiGet<Ticket[]>(
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/tickets${qs}`,
  );
}

export function updateAdminTicketStatus(
  ticketId: string,
  status: string,
  scope: ManagementApiScope = 'admin',
) {
  return apiCommand<Ticket>(
    'patch',
    `${managementBase(scope)}/tickets/${encodeURIComponent(ticketId)}/status`,
    { status },
  );
}
