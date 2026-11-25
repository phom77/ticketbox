import type { Order } from '../../api/orders';
import type { Ticket } from '../../api/tickets';

type EventRef = { concertId: string; performanceId?: string | null };

/**
 * Tickets issued for an order. Tickets carry no order id, so they are matched by event,
 * issue time (after the order was placed) and ticket type, capped at the ordered quantity.
 * Returns `null` when the match would be ambiguous: another paid order of the buyer is
 * for the same event, so its tickets could be shown as this order's.
 */
export function ticketsForOrder(order: Order, tickets: Ticket[], orders: Order[]): Ticket[] | null {
  const sameEvent = (other: EventRef) =>
    order.performanceId
      ? other.performanceId === order.performanceId
      : other.concertId === order.concertId;
  if (orders.some((other) => other.id !== order.id && other.status === 'PAID' && sameEvent(other)))
    return null;
  const placedAt = Date.parse(order.createdAt);
  const quantities = new Map<string, number>();
  for (const item of order.items) {
    quantities.set(item.ticketTypeName, (quantities.get(item.ticketTypeName) ?? 0) + item.quantity);
  }
  return tickets
    .filter((ticket) => ticket.status === 'VALID')
    .filter(sameEvent)
    .filter(
      (ticket) => !Number.isFinite(placedAt) || Date.parse(ticket.issuedAt) >= placedAt - 60_000,
    )
    .sort((a, b) => Date.parse(a.issuedAt) - Date.parse(b.issuedAt))
    .filter((ticket) => {
      const left = quantities.get(ticket.ticketTypeName) ?? 0;
      if (left <= 0) return false;
      quantities.set(ticket.ticketTypeName, left - 1);
      return true;
    });
}
