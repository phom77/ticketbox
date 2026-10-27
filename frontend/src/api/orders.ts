import { api } from './client';

export type OrderStatus =
  | 'AWAITING_PAYMENT'
  | 'PAID'
  | 'EXPIRED'
  | 'CANCELLED'
  | 'REFUNDED'
  | 'PAYMENT_FAILED';

export type OrderItem = {
  id: string;
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
};

export type Order = {
  id: string;
  concertId: string;
  concertTitle: string;
  status: OrderStatus;
  totalAmount: number;
  paymentUrl: string | null;
  expiresAt: string;
  createdAt: string;
  items: OrderItem[];
};

export type PaymentProvider = 'MOCK' | 'VNPAY' | 'MOMO';

export type PaymentInitiation = {
  orderId: string;
  provider: PaymentProvider;
  providerRef: string;
  paymentUrl: string | null;
  attemptId: string;
  attemptState: 'CREATED' | 'PROCESSING' | 'READY' | 'UNKNOWN' | 'FAILED' | 'SUCCEEDED' | 'RECONCILIATION_REQUIRED' | 'REVIEW_REQUIRED';
};

export function createOrder(
  concertId: string,
  items: Array<{ ticketTypeId: string; quantity: number }>,
  idempotencyKey: string,
  queueAccessToken?: string,
) {
  return api.post<unknown, Order>(
    '/api/orders',
    { concertId, items },
    {
      timeout: 15_000,
      headers: {
        'Idempotency-Key': idempotencyKey,
        ...(queueAccessToken ? { 'Queue-Access-Token': queueAccessToken } : {}),
      },
    },
  );
}

export function getOrder(orderId: string, signal?: AbortSignal) {
  return api.get<unknown, Order>(`/api/orders/${encodeURIComponent(orderId)}`, { signal });
}

export function getOrderByIdempotencyKey(key: string) {
  return api.get<unknown, Order>('/api/orders/by-idempotency-key', {
    headers: { 'Idempotency-Key': key },
    timeout: 10_000,
  });
}

export function initiatePayment(orderId: string, provider: PaymentProvider) {
  return api.post<unknown, PaymentInitiation>(
    `/api/payments/${encodeURIComponent(orderId)}/initiate`,
    { provider },
    { timeout: 15_000 },
  );
}

export function completeMockPayment(paymentUrl: string) {
  return api.post<unknown, void>(paymentUrl);
}

export function cancelOrder(orderId: string) {
  return api.delete<unknown, Order>(`/api/orders/${encodeURIComponent(orderId)}`);
}

export function retryOrderPayment(orderId: string) {
  return api.post<unknown, Order>(`/api/orders/${encodeURIComponent(orderId)}/retry-payment`);
}

export type PaymentStatus = {
  orderId: string;
  orderStatus: OrderStatus;
  provider: PaymentProvider | null;
  attemptId: string | null;
  attemptState: PaymentInitiation['attemptState'] | null;
  paymentUrl: string | null;
};
export function getPaymentStatus(orderId: string, signal?: AbortSignal) {
  return api.get<unknown, PaymentStatus>(`/api/payments/${encodeURIComponent(orderId)}/status`, { signal });
}
