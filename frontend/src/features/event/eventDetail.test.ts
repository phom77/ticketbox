import { describe, expect, it } from 'vitest';
import { buildIcs } from './calendar';
import {
  clampQuantity,
  dateSaleState,
  datePurchasePath,
  groupByMonth,
  quantityLimit,
  type DetailDate,
} from './eventDetail';

const now = Date.parse('2026-06-01T00:00:00Z');
const base = {
  status: 'ON_SALE',
  salesSuspended: false,
  saleStartAt: '2026-05-01T00:00:00Z',
  saleEndAt: '2026-07-01T00:00:00Z',
  legacyConcertId: null,
} as const;

describe('dateSaleState', () => {
  it('distinguishes the reasons a sale is not available', () => {
    expect(dateSaleState(base, now)).toBe('on-sale');
    expect(dateSaleState({ ...base, status: 'CANCELLED' }, now)).toBe('cancelled');
    expect(dateSaleState({ ...base, salesSuspended: true }, now)).toBe('paused');
    expect(dateSaleState({ ...base, status: 'SOLD_OUT' }, now)).toBe('sold-out');
    expect(dateSaleState(base, now, true)).toBe('sold-out');
    expect(dateSaleState({ ...base, saleEndAt: '2026-05-02T00:00:00Z' }, now)).toBe('closed');
    expect(dateSaleState({ ...base, saleStartAt: '2026-08-01T00:00:00Z' }, now)).toBe('upcoming');
  });

  it('opens the waiting room early only for the legacy flow', () => {
    const soon = { ...base, saleStartAt: '2026-06-01T00:30:00Z' };
    expect(dateSaleState(soon, now)).toBe('upcoming');
    expect(dateSaleState({ ...soon, legacyConcertId: 'c' }, now)).toBe('waiting-room');
  });
});

describe('purchase paths and quantity', () => {
  it('uses the legacy route for legacy concerts', () => {
    expect(datePurchasePath('e', { id: 'p', legacyConcertId: 'c' })).toBe('/concerts/c');
    expect(datePurchasePath('e', { id: 'p', legacyConcertId: null })).toBe(
      '/events/e/performances/p',
    );
  });

  it('keeps the quantity within the per-account limit', () => {
    expect(quantityLimit(4)).toBe(4);
    expect(quantityLimit(null)).toBe(6);
    expect(clampQuantity('9', 4)).toBe(4);
    expect(clampQuantity('0', 4)).toBe(1);
    expect(clampQuantity('x', 4)).toBe(1);
    expect(clampQuantity(null, 4)).toBe(1);
  });
});

describe('groupByMonth', () => {
  it('groups dates by month in the event timezone', () => {
    const date = (id: string, startsAt: string) =>
      ({ ...base, id, startsAt, timezone: 'Asia/Ho_Chi_Minh' }) as unknown as DetailDate;
    const groups = groupByMonth(
      [
        date('c', '2026-08-02T10:00:00Z'),
        date('a', '2026-07-31T18:00:00Z'),
        date('b', '2026-08-01T10:00:00Z'),
      ],
      'en',
    );
    expect(groups.map((group) => group.dates.map((entry) => entry.id))).toEqual([['a', 'b', 'c']]);
    expect(groups[0].label).toBe('August 2026');
  });
});

describe('buildIcs', () => {
  it('writes a calendar event with escaped text and a default end', () => {
    const ics = buildIcs(
      { uid: 'p1', title: 'A, B', startsAt: '2026-08-01T12:00:00Z', location: 'Hall; Hanoi' },
      new Date('2026-06-01T00:00:00Z'),
    );
    expect(ics).toContain('DTSTART:20260801T120000Z');
    expect(ics).toContain('DTEND:20260801T150000Z');
    expect(ics).toContain('SUMMARY:A\\, B');
    expect(ics).toContain('LOCATION:Hall\\; Hanoi');
    expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
  });
});
