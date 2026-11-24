import type { Order, OrderStatus } from '../../api/orders';

export const orderStatusKeys = {
  AWAITING_PAYMENT: 'customer:profilePage_choThanhToan',
  PAID: 'customer:profilePage_daThanhToan',
  CANCELLED: 'customer:profilePage_daHuy',
  EXPIRED: 'customer:profilePage_hetHan',
  PAYMENT_FAILED: 'customer:profilePage_thanhToanLoi',
  REFUNDED: 'customer:profilePage_refunded',
} satisfies Record<OrderStatus, string>;

export function orderDeadline(order: Pick<Order, 'expiresAt'>) {
  return Date.parse(order.expiresAt || '');
}

export function displayedOrderStatus(order: Order, now: number): OrderStatus {
  return order.status === 'AWAITING_PAYMENT' && orderDeadline(order) <= now
    ? 'EXPIRED'
    : order.status;
}

export type TimelineStep = {
  key:
    | 'created'
    | 'awaitingPayment'
    | 'paid'
    | 'ticketsIssued'
    | 'expired'
    | 'cancelled'
    | 'paymentFailed'
    | 'refunded';
  state: 'done' | 'current' | 'problem';
  at?: string;
};

/** Built from the order fields alone: the order carries no per-step timestamps beyond creation. */
export function buildOrderTimeline(order: Order, status: OrderStatus): TimelineStep[] {
  const steps: TimelineStep[] = [{ key: 'created', state: 'done', at: order.createdAt }];
  switch (status) {
    case 'AWAITING_PAYMENT':
      steps.push({ key: 'awaitingPayment', state: 'current', at: order.expiresAt });
      break;
    case 'PAID':
      steps.push({ key: 'paid', state: 'done' }, { key: 'ticketsIssued', state: 'done' });
      break;
    case 'REFUNDED':
      steps.push(
        { key: 'paid', state: 'done' },
        { key: 'ticketsIssued', state: 'done' },
        { key: 'refunded', state: 'problem' },
      );
      break;
    case 'EXPIRED':
      steps.push({ key: 'expired', state: 'problem', at: order.expiresAt });
      break;
    case 'CANCELLED':
      steps.push({ key: 'cancelled', state: 'problem' });
      break;
    case 'PAYMENT_FAILED':
      steps.push({ key: 'paymentFailed', state: 'problem' });
      break;
  }
  return steps;
}

export function seatSummary(order: Pick<Order, 'items'>) {
  const seats = order.items
    .map((item) => [item.sectionLabel, item.rowLabel, item.seatLabel].filter(Boolean).join(' '))
    .filter(Boolean);
  return { seats, quantity: order.items.reduce((sum, item) => sum + item.quantity, 0) };
}
