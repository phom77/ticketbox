import type { Ticket } from '../../api/tickets';

type Stored = { ticket: Ticket; savedAt: string };

function key(userId: string, ticketId: string) {
  return `ticketbox.offlineTicket.${userId}.${ticketId}`;
}

/** Keeps the last viewed ticket on this device so the QR still opens without a connection. */
export function saveOfflineTicket(userId: string, ticket: Ticket, now = new Date()) {
  try {
    const value: Stored = { ticket, savedAt: now.toISOString() };
    window.localStorage.setItem(key(userId, ticket.id), JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function loadOfflineTicket(userId: string, ticketId: string): Stored | null {
  try {
    const raw = window.localStorage.getItem(key(userId, ticketId));
    if (!raw) return null;
    const value = JSON.parse(raw) as Stored;
    return value?.ticket?.id === ticketId && typeof value.ticket.qrCode === 'string' ? value : null;
  } catch {
    return null;
  }
}
