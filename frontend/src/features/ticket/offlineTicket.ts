import type { Ticket } from '../../api/tickets';

type Stored = { ticket: Ticket; savedAt: string };

const prefix = 'ticketbox.offlineTicket.';

function key(userId: string, ticketId: string) {
  return `${prefix}${userId}.${ticketId}`;
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

/** Drops a saved copy, for a ticket that can no longer be used. */
export function removeOfflineTicket(userId: string, ticketId: string) {
  try {
    window.localStorage.removeItem(key(userId, ticketId));
  } catch {
    /* Storage can be unavailable; nothing to remove then. */
  }
}

/** Removes every saved ticket on this device, so a shared device keeps no QR after sign-out. */
export function clearOfflineTickets() {
  try {
    const storage = window.localStorage;
    for (let index = storage.length - 1; index >= 0; index -= 1) {
      const name = storage.key(index);
      if (name?.startsWith(prefix)) storage.removeItem(name);
    }
  } catch {
    /* Storage can be unavailable; nothing to remove then. */
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
