import { describe, expect, it } from 'vitest';
import { checkPublishAt } from './performanceDateTime';

const now = Date.parse('2026-12-01T00:00:00Z');
const performance = { timezone: 'Asia/Tokyo', saleStartAt: '2026-12-10T03:00:00Z' };

describe('checkPublishAt', () => {
  it('reads the release time in the performance timezone', () => {
    expect(checkPublishAt('2026-12-05T09:00', performance, now)).toEqual({
      ok: true,
      instant: '2026-12-05T00:00:00.000Z',
    });
  });

  it('rejects past times and times after sales open', () => {
    expect(checkPublishAt('2026-11-30T09:00', performance, now)).toEqual({
      ok: false,
      reason: 'past',
    });
    expect(checkPublishAt('2026-12-10T12:01', performance, now)).toEqual({
      ok: false,
      reason: 'afterSaleStart',
    });
    expect(checkPublishAt('2026-12-10T12:00', performance, now).ok).toBe(true);
  });

  it('reports skipped local times', () => {
    expect(
      checkPublishAt(
        '2027-03-14T02:30',
        { timezone: 'America/New_York', saleStartAt: '2027-04-01T00:00:00Z' },
        now,
      ),
    ).toEqual({ ok: false, reason: 'nonexistent' });
  });
});
