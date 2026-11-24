import type { ConcertTranslations } from '../../api/concerts';
import type { Order, PaymentProvider, PaymentStatus } from '../../api/orders';

export type CheckoutEvent = {
  id: string;
  eventId?: string | null;
  title: string;
  translations?: ConcertTranslations;
  venue: string;
  date: string;
  image: string | null;
};

const pendingPaymentKey = 'ticketbox.pending-payment';

type PendingPayment = {
  orderId: string;
  provider?: PaymentProvider;
};

export function readPendingPayment(): PendingPayment | null {
  try {
    const value = sessionStorage.getItem(pendingPaymentKey);
    return value ? (JSON.parse(value) as PendingPayment) : null;
  } catch {
    return null;
  }
}

export function rememberPendingPayment(orderId: string, provider: PaymentProvider) {
  sessionStorage.setItem(pendingPaymentKey, JSON.stringify({ orderId, provider }));
}

export function clearPendingPayment(orderId: string) {
  if (readPendingPayment()?.orderId === orderId) sessionStorage.removeItem(pendingPaymentKey);
}

export function orderWindowExpired(order: Order) {
  return (
    order.status === 'EXPIRED' ||
    (order.status === 'AWAITING_PAYMENT' && new Date(order.expiresAt).getTime() <= Date.now())
  );
}

export function paymentNeedsReview(state: PaymentStatus['attemptState']) {
  return state === 'RECONCILIATION_REQUIRED' || state === 'REVIEW_REQUIRED';
}

export function paymentStillVerifying(state: PaymentStatus['attemptState']) {
  return (
    state === 'UNKNOWN' ||
    state === 'PROCESSING' ||
    state === 'SUCCEEDED' ||
    paymentNeedsReview(state)
  );
}
