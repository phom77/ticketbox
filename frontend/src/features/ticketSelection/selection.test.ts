import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../../api/client';
import {
  clampView,
  heldUntil,
  holdProblem,
  parseQuantity,
  priceBounds,
  stepperReason,
  stockLevel,
  visibleRows,
  zoomView,
  defaultFilters,
  type OfferRow,
} from './selection';

const row = (
  key: string,
  price: number,
  available: number,
  order: number | null = null,
): OfferRow => ({
  key,
  sectionId: key,
  sectionLabel: key,
  sectionOrder: order,
  offerId: key,
  offerName: price > 100 ? 'VIP' : 'Standard',
  price,
  available,
  kind: 'ASSIGNED',
  maxPerAccount: 4,
});

describe('selection helpers', () => {
  it('reads and bounds the requested quantity', () => {
    expect(parseQuantity('?qty=3')).toBe(3);
    expect(parseQuantity('?qty=99', 4)).toBe(4);
    expect(parseQuantity('?qty=abc')).toBe(1);
    expect(parseQuantity('')).toBe(1);
  });

  it('filters by quantity, price and type and sorts by price', () => {
    const rows = [row('A', 200, 5), row('B', 50, 1), row('C', 80, 9)];
    expect(visibleRows(rows, { ...defaultFilters, quantity: 2 }).map((r) => r.key)).toEqual([
      'C',
      'A',
    ]);
    expect(visibleRows(rows, { ...defaultFilters, maxPrice: 90 }).map((r) => r.key)).toEqual([
      'B',
      'C',
    ]);
    expect(visibleRows(rows, { ...defaultFilters, offerName: 'VIP' }).map((r) => r.key)).toEqual([
      'A',
    ]);
    expect(priceBounds(rows)).toEqual({ min: 50, max: 200 });
  });

  it('sorts best seats by section order, else by price descending', () => {
    const ordered = [row('A', 50, 5, 2), row('B', 90, 5, 1)];
    expect(visibleRows(ordered, { ...defaultFilters, sort: 'best' }).map((r) => r.key)).toEqual([
      'B',
      'A',
    ]);
    const unordered = [row('A', 50, 5), row('B', 90, 5)];
    expect(visibleRows(unordered, { ...defaultFilters, sort: 'best' }).map((r) => r.key)).toEqual([
      'B',
      'A',
    ]);
  });

  it('classifies stock and stepper limits', () => {
    expect(stockLevel(0)).toBe('sold');
    expect(stockLevel(4)).toBe('few');
    expect(stockLevel(40)).toBe('available');
    const r = { available: 3, maxPerAccount: 2 };
    expect(stepperReason(r, 2, 'add')).toBe('limit');
    expect(stepperReason({ ...r, available: 0 }, 0, 'add')).toBe('soldOut');
    expect(stepperReason(r, 0, 'remove')).toBe('none');
    expect(stepperReason(r, 1, 'add')).toBeNull();
  });

  it('maps server failures to problems without raw text', () => {
    expect(holdProblem(new ApiClientError('x', 429))).toBe('rateLimit');
    expect(holdProblem(new ApiClientError('x', 409))).toBe('conflict');
    expect(holdProblem(new ApiClientError('Per account limit exceeded', 422))).toBe('quota');
    expect(holdProblem(new ApiClientError('Seat already held', 422))).toBe('soldOut');
    expect(holdProblem(new Error('boom'))).toBe('generic');
  });

  it('formats the hold time in the performance time zone', () => {
    expect(heldUntil('2026-01-01T12:00:00Z', 'Asia/Ho_Chi_Minh', 'en-US')).toBe('7:00 PM');
    expect(heldUntil(null, 'UTC')).toBeNull();
  });

  it('zooms within limits and keeps the map in view', () => {
    const zoomed = zoomView({ scale: 1, x: 0, y: 0 }, 2, { x: 100, y: 50 });
    expect(zoomed.scale).toBe(2);
    expect(zoomView(zoomed, 0.1)).toEqual({ scale: 1, x: 0, y: 0 });
    expect(zoomView({ scale: 6, x: 0, y: 0 }, 2).scale).toBe(6);
    expect(clampView({ scale: 2, x: 50, y: -999 }, 400, 300)).toEqual({ scale: 2, x: 0, y: -300 });
  });
});
