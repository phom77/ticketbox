import { describe, expect, it } from 'vitest';
import { checklistComplete, etaRange, queueProgress } from './waitingRoom';

describe('waiting room helpers', () => {
  it('turns an estimate into a minute range', () => {
    expect(etaRange(600)).toEqual({ low: 8, high: 13 });
    expect(etaRange(10)).toEqual({ low: 1, high: 1 });
    expect(etaRange(null)).toBeNull();
    expect(etaRange(-1)).toBeNull();
  });

  it('measures progress from the largest number of people ahead', () => {
    expect(queueProgress(50, 200)).toBe(0.75);
    expect(queueProgress(0, 200)).toBe(1);
    expect(queueProgress(300, 200)).toBe(0);
    expect(queueProgress(null, 200)).toBe(0);
    expect(queueProgress(5, 0)).toBe(0);
  });

  it('is ready only when signed in, paid-ready and quantity set', () => {
    expect(checklistComplete({ signedIn: true, paymentReady: true, quantity: 2 })).toBe(true);
    expect(checklistComplete({ signedIn: true, paymentReady: false, quantity: 2 })).toBe(false);
  });
});
