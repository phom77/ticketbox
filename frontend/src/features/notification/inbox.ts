import type { NotificationItem } from '../../api/notifications';

export function isToday(createdAt: string, now: Date) {
  const date = new Date(createdAt);
  return (
    date.getFullYear() === now.getFullYear() &&
    date.getMonth() === now.getMonth() &&
    date.getDate() === now.getDate()
  );
}

export function groupByDay(items: NotificationItem[], now: Date) {
  const today: NotificationItem[] = [];
  const earlier: NotificationItem[] = [];
  for (const item of items) (isToday(item.createdAt, now) ? today : earlier).push(item);
  return { today, earlier };
}

/**
 * Notifications carry no order, ticket or event id, so they link to the list that holds the
 * record. Cancelled and postponed events and ticket transfers show on the ticket wallet, where
 * open offers are listed first.
 */
export function notificationDestination(eventType: string) {
  switch (eventType) {
    case 'PAYMENT_SUCCEEDED':
    case 'CONCERT_REMINDER':
    case 'EVENT_POSTPONED':
    case 'EVENT_CANCELLED':
      return { to: '/my-tickets', label: 'notificationsPage_myTickets' };
    case 'TICKET_TRANSFER_OFFERED':
    case 'TICKET_TRANSFER_ACCEPTED':
    case 'TICKET_TRANSFER_DECLINED':
    case 'TICKET_TRANSFER_CANCELLED':
    case 'TICKET_TRANSFER_EXPIRED':
      return { to: '/my-tickets', label: 'notificationsPage_myTickets' };
    case 'REFUND_REQUEST_RECEIVED':
    case 'REFUND_REQUEST_APPROVED':
    case 'REFUND_REQUEST_REJECTED':
    case 'ORDER_REFUNDED':
      return { to: '/account/orders', label: 'notificationsPage_orderHistory' };
    default:
      return null;
  }
}
