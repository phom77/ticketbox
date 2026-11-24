import { beforeEach, describe, expect, it } from 'vitest';
import type { Ticket } from '../../api/tickets';
import {
  clearOfflineTickets,
  loadOfflineTicket,
  removeOfflineTicket,
  saveOfflineTicket,
} from './offlineTicket';

const ticket = { id: 't1', qrCode: 'QR', status: 'VALID' } as Ticket;

describe('offline ticket copy', () => {
  beforeEach(() => window.localStorage.clear());

  it('round-trips a ticket for the same account only', () => {
    expect(saveOfflineTicket('u1', ticket, new Date('2026-11-24T00:00:00Z'))).toBe(true);
    expect(loadOfflineTicket('u1', 't1')?.ticket.qrCode).toBe('QR');
    expect(loadOfflineTicket('u1', 't1')?.savedAt).toBe('2026-11-24T00:00:00.000Z');
    expect(loadOfflineTicket('u2', 't1')).toBeNull();
  });

  it('removes one copy, or every copy on sign-out, and keeps other storage', () => {
    saveOfflineTicket('u1', ticket);
    saveOfflineTicket('u2', { ...ticket, id: 't2' });
    window.localStorage.setItem('ticketbox.language', 'vi');
    removeOfflineTicket('u1', 't1');
    expect(loadOfflineTicket('u1', 't1')).toBeNull();
    expect(loadOfflineTicket('u2', 't2')).not.toBeNull();
    clearOfflineTickets();
    expect(loadOfflineTicket('u2', 't2')).toBeNull();
    expect(window.localStorage.getItem('ticketbox.language')).toBe('vi');
  });

  it('ignores corrupt data', () => {
    window.localStorage.setItem('ticketbox.offlineTicket.u1.t1', '{oops');
    expect(loadOfflineTicket('u1', 't1')).toBeNull();
  });
});
