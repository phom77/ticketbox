import { describe, expect, it } from 'vitest';
import type { TicketTransfer } from '../../api/tickets';
import {
  acceptedTransfersForOrder,
  isTransferEmail,
  normalizeEmail,
  pendingReceivedOffers,
  transferBlockerKey,
} from './transfer';

function transfer(overrides: Partial<TicketTransfer>): TicketTransfer {
  return {
    id: 't1',
    ticketId: 'k1',
    orderId: 'o1',
    role: 'RECEIVED',
    status: 'PENDING',
    otherPartyName: 'Sam',
    concertId: 'c1',
    concertTitle: 'Concert',
    createdAt: '2026-12-01T10:00:00Z',
    expiresAt: '2026-12-30T10:00:00Z',
    ...overrides,
  };
}

describe('ticket transfer rules shown to buyers', () => {
  it('explains the blockers that have an action to wait for and hides the rest', () => {
    expect(transferBlockerKey('CUTOFF')).toBe('customer:transfer_blockedCutoff');
    expect(transferBlockerKey('REFUND_HOLD')).toBe('customer:transfer_blockedRefund');
    expect(transferBlockerKey('DISRUPTED')).toBe('customer:transfer_blockedDisrupted');
    expect(transferBlockerKey('RECEIVED')).toBeNull();
    expect(transferBlockerKey('NOT_VALID')).toBeNull();
    expect(transferBlockerKey(null)).toBeNull();
  });

  it('validates the recipient email before asking the server', () => {
    expect(isTransferEmail(' Friend@Example.com ')).toBe(true);
    expect(normalizeEmail(' Friend@Example.com ')).toBe('friend@example.com');
    expect(isTransferEmail('friend@')).toBe(false);
    expect(isTransferEmail('two words@example.com')).toBe(false);
    expect(isTransferEmail('a@b.co'.padEnd(260, 'x'))).toBe(false);
  });

  it('lists only open offers for me, soonest first', () => {
    const now = Date.parse('2026-12-02T00:00:00Z');
    const offers = pendingReceivedOffers(
      [
        transfer({ id: 'late', expiresAt: '2026-12-30T10:00:00Z' }),
        transfer({ id: 'soon', expiresAt: '2026-12-05T10:00:00Z' }),
        transfer({ id: 'expired', expiresAt: '2026-12-01T12:00:00Z' }),
        transfer({ id: 'done', status: 'ACCEPTED' }),
        transfer({ id: 'sent', role: 'SENT' }),
      ],
      now,
    );
    expect(offers.map((offer) => offer.id)).toEqual(['soon', 'late']);
  });

  it('finds the tickets of an order that were given away', () => {
    const transfers = [
      transfer({ id: 'a', role: 'SENT', status: 'ACCEPTED' }),
      transfer({ id: 'b', role: 'SENT', status: 'PENDING' }),
      transfer({ id: 'c', role: 'SENT', status: 'ACCEPTED', orderId: 'other' }),
      transfer({ id: 'd', role: 'RECEIVED', status: 'ACCEPTED' }),
    ];
    expect(acceptedTransfersForOrder(transfers, 'o1').map((item) => item.id)).toEqual(['a']);
  });
});
