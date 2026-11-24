import { getOrder, getPaymentStatus, type Order, type PaymentStatus } from '../../api/orders';
import { orderWindowExpired, paymentNeedsReview, paymentStillVerifying } from './checkoutPayment';

/**
 * What the buyer can do with an order, decided from server-owned order and payment state.
 * Checkout resume, the payment result page and the confirmation page all use this.
 */
export type OrderOutcomeKind =
  | 'paid'
  | 'unavailable'
  | 'expired'
  | 'expiredPending'
  | 'review'
  | 'closed'
  | 'verifying'
  | 'failed'
  | 'payable';

export type OrderOutcome = {
  kind: OrderOutcomeKind;
  /** The remembered pending payment can be forgotten: the order reached a final state. */
  settled: boolean;
};

/** The deep-linkable confirmation page of a paid order. */
export const confirmationPath = (orderId: string) =>
  `/orders/${encodeURIComponent(orderId)}/confirmation`;

const outcome = (kind: OrderOutcomeKind, settled = false): OrderOutcome => ({ kind, settled });

export function resolveOrderOutcome(
  order: Order,
  payment: Pick<PaymentStatus, 'attemptState'> | null,
): OrderOutcome {
  if (order.status === 'PAID') return outcome('paid', true);
  const expired = orderWindowExpired(order);
  if (!payment) return outcome(expired ? 'expiredPending' : 'unavailable');

  const state = payment.attemptState;
  const verifying = paymentStillVerifying(state);
  if (expired) return verifying ? outcome('expiredPending') : outcome('expired', true);
  if (paymentNeedsReview(state)) return outcome('review');
  if (order.status !== 'AWAITING_PAYMENT')
    return verifying ? outcome('review') : outcome('closed', true);
  if (verifying) return outcome('verifying');
  if (state === 'FAILED') return outcome('failed');
  return outcome('payable');
}

export type OrderSnapshot = {
  order: Order;
  payment: PaymentStatus | null;
  outcome: OrderOutcome;
};

/** Reads the order and, when asked, its payment status. A payment status failure is `null`. */
export async function readOrderSnapshot(
  orderId: string,
  { signal, includePayment = true }: { signal?: AbortSignal; includePayment?: boolean } = {},
): Promise<OrderSnapshot> {
  const paymentRequest = includePayment
    ? getPaymentStatus(orderId, signal).catch(() => null)
    : Promise.resolve(null);
  const order = await getOrder(orderId, signal);
  const payment = await paymentRequest;
  return { order, payment, outcome: resolveOrderOutcome(order, payment) };
}

function pause(ms: number, signal?: AbortSignal) {
  return new Promise<void>((resolve) => {
    if (signal?.aborted) return resolve();
    const timer = window.setTimeout(done, ms);
    signal?.addEventListener('abort', done, { once: true });
    function done() {
      window.clearTimeout(timer);
      signal?.removeEventListener('abort', done);
      resolve();
    }
  });
}

/**
 * Reads the order up to `attempts` times, `intervalMs` apart, until `isFinal` accepts a
 * snapshot. Resolves that snapshot, or `null` when attempts run out or the signal aborts.
 * Request errors reject so each caller keeps its own failure message.
 */
export async function pollOrderOutcome(
  orderId: string,
  {
    attempts,
    intervalMs,
    signal,
    includePayment = true,
    isFinal,
    onSnapshot,
  }: {
    attempts: number;
    intervalMs: number;
    signal?: AbortSignal;
    includePayment?: boolean;
    isFinal: (snapshot: OrderSnapshot) => boolean;
    onSnapshot?: (snapshot: OrderSnapshot) => void;
  },
): Promise<OrderSnapshot | null> {
  for (let attempt = 0; attempt < attempts && !signal?.aborted; attempt += 1) {
    const snapshot = await readOrderSnapshot(orderId, { signal, includePayment });
    if (signal?.aborted) return null;
    onSnapshot?.(snapshot);
    if (isFinal(snapshot)) return snapshot;
    await pause(intervalMs, signal);
  }
  return null;
}
