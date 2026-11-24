import type { Order } from '../../api/orders';
import type { Ticket } from '../../api/tickets';

/**
 * Tickets issued for an order. Tickets carry no order id, so they are matched by event,
 * issue time (after the order was placed) and ticket type, capped at the ordered quantity.
 */
export function ticketsForOrder(order: Order, tickets: Ticket[]): Ticket[] {
  const placedAt = Date.parse(order.createdAt);
  const quantities = new Map<string, number>();
  for (const item of order.items) {
    quantities.set(item.ticketTypeName, (quantities.get(item.ticketTypeName) ?? 0) + item.quantity);
  }
  return tickets
    .filter((ticket) => ticket.status === 'VALID')
    .filter((ticket) =>
      order.performanceId
        ? ticket.performanceId === order.performanceId
        : ticket.concertId === order.concertId,
    )
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
