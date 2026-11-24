import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order, PaymentStatus } from '../../api/orders';
import { pollOrderOutcome, resolveOrderOutcome } from './orderOutcome';

const getOrder = vi.hoisted(() => vi.fn());
const getPaymentStatus = vi.hoisted(() => vi.fn());
vi.mock('../../api/orders', () => ({ getOrder, getPaymentStatus }));

const now = Date.parse('2027-01-01T10:00:00Z');
const future = '2027-01-01T10:05:00Z';
const past = '2027-01-01T09:55:00Z';

function order(patch: Partial<Order> = {}): Order {
  return {
    id: 'order-1',
    concertId: 'c',
    concertTitle: 'Show',
    status: 'AWAITING_PAYMENT',
    totalAmount: 100,
    paymentUrl: null,
    expiresAt: future,
    createdAt: past,
    items: [],
    ...patch,
  };
}

const payment = (attemptState: PaymentStatus['attemptState']) => ({ attemptState });

describe('resolveOrderOutcome', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });
  afterEach(() => vi.useRealTimers());

  it.each([
    ['paid order', order({ status: 'PAID' }), null, 'paid', true],
    ['unreadable payment, open window', order(), null, 'unavailable', false],
    [
      'unreadable payment, expired window',
      order({ expiresAt: past }),
      null,
      'expiredPending',
      false,
    ],
    [
      'expired while verifying',
      order({ expiresAt: past }),
      payment('PROCESSING'),
      'expiredPending',
      false,
    ],
    [
      'expired without verification',
      order({ status: 'EXPIRED' }),
      payment('READY'),
      'expired',
      true,
    ],
    ['needs reconciliation', order(), payment('RECONCILIATION_REQUIRED'), 'review', false],
    ['needs review', order(), payment('REVIEW_REQUIRED'), 'review', false],
    ['closed while verifying', order({ status: 'CANCELLED' }), payment('UNKNOWN'), 'review', false],
    ['closed', order({ status: 'CANCELLED' }), payment('FAILED'), 'closed', true],
    ['refunded', order({ status: 'REFUNDED' }), payment(null), 'closed', true],
    ['provider still processing', order(), payment('PROCESSING'), 'verifying', false],
    [
      'provider reported success, order not yet paid',
      order(),
      payment('SUCCEEDED'),
      'verifying',
      false,
    ],
    ['failed attempt', order(), payment('FAILED'), 'failed', false],
    ['ready session', order(), payment('READY'), 'payable', false],
    ['created session', order(), payment('CREATED'), 'payable', false],
    ['no attempt yet', order(), payment(null), 'payable', false],
  ] as const)('%s', (_, current, status, kind, settled) => {
    expect(resolveOrderOutcome(current, status)).toEqual({ kind, settled });
  });
});

describe('pollOrderOutcome', () => {
  beforeEach(() => {
    getOrder.mockReset();
    getPaymentStatus.mockReset();
    getPaymentStatus.mockResolvedValue({ attemptState: null });
  });

  it('stops when the caller accepts a snapshot', async () => {
    getOrder.mockResolvedValueOnce(order()).mockResolvedValueOnce(order({ status: 'PAID' }));
    getPaymentStatus.mockResolvedValue({ attemptState: 'PROCESSING' });
    const seen: string[] = [];
    const result = await pollOrderOutcome('order-1', {
      attempts: 5,
      intervalMs: 1,
      isFinal: (snapshot) => snapshot.outcome.kind === 'paid',
      onSnapshot: (snapshot) => seen.push(snapshot.outcome.kind),
    });
    expect(result?.outcome.kind).toBe('paid');
    expect(seen).toEqual(['verifying', 'paid']);
    expect(getOrder).toHaveBeenCalledTimes(2);
  });

  it('returns null after the attempt limit and skips payment status when not needed', async () => {
    getOrder.mockResolvedValue(order());
    const result = await pollOrderOutcome('order-1', {
      attempts: 3,
      intervalMs: 1,
      includePayment: false,
      isFinal: () => false,
    });
    expect(result).toBeNull();
    expect(getOrder).toHaveBeenCalledTimes(3);
    expect(getPaymentStatus).not.toHaveBeenCalled();
  });

  it('treats an unreadable payment status as null and rejects on order errors', async () => {
    getOrder.mockResolvedValueOnce(order());
    getPaymentStatus.mockRejectedValueOnce(new Error('down'));
    const result = await pollOrderOutcome('order-1', {
      attempts: 1,
      intervalMs: 1,
      isFinal: () => true,
    });
    expect(result?.payment).toBeNull();
    expect(result?.outcome.kind).toBe('unavailable');

    getOrder.mockRejectedValueOnce(new Error('order down'));
    await expect(
      pollOrderOutcome('order-1', { attempts: 1, intervalMs: 1, isFinal: () => true }),
    ).rejects.toThrow('order down');
  });

  it('stops waiting when aborted', async () => {
    getOrder.mockResolvedValue(order());
    getPaymentStatus.mockResolvedValue({ attemptState: 'PROCESSING' });
    const controller = new AbortController();
    const result = pollOrderOutcome('order-1', {
      attempts: 10,
      intervalMs: 60_000,
      signal: controller.signal,
      isFinal: () => false,
      onSnapshot: () => controller.abort(),
    });
    expect(await result).toBeNull();
    expect(getOrder).toHaveBeenCalledTimes(1);
  });
});
