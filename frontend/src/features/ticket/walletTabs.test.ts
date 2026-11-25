import { describe, expect, it } from 'vitest';
import { isUpcomingEvent } from './walletTabs';

describe('isUpcomingEvent', () => {
  const now = Date.parse('2026-12-01T00:00:00Z');
  it('needs a valid ticket and a future or unknown date', () => {
    expect(isUpcomingEvent(now + 1, ['VALID'], now)).toBe(true);
    expect(isUpcomingEvent(null, ['USED', 'VALID'], now)).toBe(true);
    expect(isUpcomingEvent(now - 1, ['VALID'], now)).toBe(false);
    expect(isUpcomingEvent(now + 1, ['USED', 'CANCELLED'], now)).toBe(false);
  });
});
