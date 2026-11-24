import { describe, expect, it } from 'vitest';
import type { Order } from '../../api/orders';
import type { Ticket } from '../../api/tickets';
import { ticketsForOrder } from './orderTickets';

const order = {
  id: 'o1',
  status: 'PAID',
  concertId: 'c1',
  createdAt: '2026-01-01T10:00:00Z',
  items: [{ ticketTypeName: 'GA', quantity: 2 }],
} as Order;

const ticket = (id: string, over: Partial<Ticket> = {}) =>
  ({
    id,
    concertId: 'c1',
    ticketTypeName: 'GA',
    status: 'VALID',
    issuedAt: '2026-01-01T10:05:00Z',
    ...over,
  }) as Ticket;

describe('ticketsForOrder', () => {
  it('keeps valid tickets of the event issued after the order, up to the quantity', () => {
    const result = ticketsForOrder(
      order,
      [
        ticket('a'),
        ticket('b'),
        ticket('c'),
        ticket('old', { issuedAt: '2025-12-01T10:00:00Z' }),
        ticket('used', { status: 'USED' }),
        ticket('other', { concertId: 'c2' }),
      ],
      [order],
    );
    expect(result?.map((entry) => entry.id)).toEqual(['a', 'b']);
  });

  it('matches performance orders by performance id', () => {
    const performanceOrder = { ...order, performanceId: 'p1' } as Order;
    const result = ticketsForOrder(
      performanceOrder,
      [ticket('a', { performanceId: 'p1' }), ticket('b', { performanceId: 'p2' })],
      [],
    );
    expect(result?.map((entry) => entry.id)).toEqual(['a']);
  });

  it('returns null when another paid order is for the same event', () => {
    const other = { ...order, id: 'o2', createdAt: '2026-01-01T09:00:00Z' } as Order;
    expect(ticketsForOrder(order, [ticket('a')], [order, other])).toBeNull();
    const cancelled = { ...other, status: 'CANCELLED' } as Order;
    expect(ticketsForOrder(order, [ticket('a')], [cancelled])).toHaveLength(1);
    const elsewhere = { ...other, concertId: 'c2' } as Order;
    expect(ticketsForOrder(order, [ticket('a')], [elsewhere])).toHaveLength(1);
  });
});
