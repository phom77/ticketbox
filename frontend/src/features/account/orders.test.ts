import { describe, expect, it } from 'vitest';
import type { Order } from '../../api/orders';
import { buildOrderTimeline, displayedOrderStatus, seatSummary } from './orders';

const order = {
  id: 'o1',
  status: 'PAID',
  createdAt: '2026-11-01T00:00:00Z',
  expiresAt: '2026-11-01T00:15:00Z',
  items: [
    {
      id: 'i',
      ticketTypeName: 'VIP',
      quantity: 2,
      sectionLabel: 'A',
      rowLabel: '1',
      seatLabel: '3',
    },
    { id: 'j', ticketTypeName: 'GA', quantity: 1 },
  ],
} as Order;

describe('order account helpers', () => {
  it('builds the paid timeline', () => {
    expect(buildOrderTimeline(order, 'PAID').map((s) => s.key)).toEqual([
      'created',
      'paid',
      'ticketsIssued',
    ]);
  });

  it('ends a refunded order with the refund step', () => {
    const keys = buildOrderTimeline(order, 'REFUNDED').map((s) => s.key);
    expect(keys[keys.length - 1]).toBe('refunded');
  });

  it('shows an unpaid order past its deadline as expired', () => {
    const open = { ...order, status: 'AWAITING_PAYMENT' } as Order;
    expect(displayedOrderStatus(open, Date.parse('2026-11-02T00:00:00Z'))).toBe('EXPIRED');
    expect(buildOrderTimeline(open, 'EXPIRED').map((s) => s.key)).toContain('expired');
  });

  it('summarises seats and quantity', () => {
    expect(seatSummary(order)).toEqual({ seats: ['A 1 3'], quantity: 3 });
  });
});
