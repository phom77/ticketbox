import { describe, expect, it } from 'vitest';
import type { RefundRequest } from '../../api/refundRequests';
import {
  blockerNeedsOptionsLink,
  hasKeptTicket,
  isOpenRequest,
  keepTicket,
  refundBlockerKey,
  refundStatusKey,
  refundSteps,
  validRefundReason,
} from './refundRequest';

function request(status: RefundRequest['status'], origin: RefundRequest['origin'] = 'BUYER') {
  return {
    id: 'r1',
    orderId: 'o1',
    status,
    origin,
    reason: 'Cannot attend',
    createdAt: '2026-12-01T10:00:00Z',
    canWithdraw: status === 'REQUESTED',
  } satisfies RefundRequest;
}

function memory() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
  };
}

describe('refund request presentation', () => {
  it('walks Requested, Approved or Rejected, then Refunded', () => {
    expect(refundSteps(request('REQUESTED')).map((step) => step.state)).toEqual([
      'done',
      'current',
      'upcoming',
    ]);
    expect(refundSteps(request('APPROVED')).map((step) => step.state)).toEqual([
      'done',
      'done',
      'current',
    ]);
    expect(refundSteps(request('REFUNDED')).every((step) => step.state === 'done')).toBe(true);
    expect(refundSteps(request('REJECTED'))).toHaveLength(2);
  });

  it('names the platform team when a postponement request has no organizer step', () => {
    expect(refundStatusKey('APPROVED', 'BUYER')).toBe('customer:refund_status_APPROVED');
    expect(refundStatusKey('APPROVED', 'POSTPONEMENT')).toBe('customer:refund_status_PLATFORM');
  });

  it('only open requests block another request', () => {
    expect(isOpenRequest(request('REQUESTED'))).toBe(true);
    expect(isOpenRequest(request('APPROVED'))).toBe(true);
    expect(isOpenRequest(request('REJECTED'))).toBe(false);
    expect(isOpenRequest(null)).toBe(false);
  });

  it('explains blockers and links cancelled events to the options page', () => {
    expect(refundBlockerKey('TICKET_USED')).toBe('customer:refund_blocked_TICKET_USED');
    expect(refundBlockerKey(null)).toBeNull();
    expect(blockerNeedsOptionsLink('CANCELLED')).toBe(true);
    expect(blockerNeedsOptionsLink('WINDOW_CLOSED')).toBe(false);
  });

  it('requires a reason that is not blank and not too long', () => {
    expect(validRefundReason('  ')).toBe(false);
    expect(validRefundReason('Cannot attend')).toBe(true);
    expect(validRefundReason('x'.repeat(1001))).toBe(false);
  });

  it('remembers Keep my ticket per person, event and new date', () => {
    const storage = memory();
    keepTicket(storage, 'u1', 'c1', '2027-01-10T12:00:00Z');
    expect(hasKeptTicket(storage, 'u1', 'c1', '2027-01-10T12:00:00Z')).toBe(true);
    expect(hasKeptTicket(storage, 'u2', 'c1', '2027-01-10T12:00:00Z')).toBe(false);
    expect(hasKeptTicket(storage, 'u1', 'c1', '2027-02-10T12:00:00Z')).toBe(false);
  });
});
