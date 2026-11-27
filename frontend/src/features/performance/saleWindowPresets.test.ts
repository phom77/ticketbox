import { describe, expect, it } from 'vitest';
import { applyPreset, detectPreset, summarizeWindow } from './saleWindowPresets';

const performance = {
  // 1 Dec 10:00 to 31 Dec 20:00 in Ho Chi Minh City (UTC+7).
  saleStartAt: '2026-12-01T03:00:00.000Z',
  saleEndAt: '2026-12-31T13:00:00.000Z',
  timezone: 'Asia/Ho_Chi_Minh',
};

function ok(result: ReturnType<typeof applyPreset>) {
  if (!result.ok) throw new Error('expected a window: ' + result.reason);
  return result.window;
}

describe('sale window presets', () => {
  it('uses the whole sale period', () => {
    expect(ok(applyPreset('whole', performance))).toEqual({
      saleStartAt: performance.saleStartAt,
      saleEndAt: performance.saleEndAt,
    });
  });

  it('ends an early bird at 23:59 venue time on the chosen date', () => {
    const window = ok(applyPreset('early', performance, { date: '2026-12-15' }));
    expect(window.saleStartAt).toBe(performance.saleStartAt);
    expect(window.saleEndAt).toBe('2026-12-15T16:59:00.000Z');
  });

  it('clamps an early bird that ends after the sale window', () => {
    expect(ok(applyPreset('early', performance, { date: '2027-02-01' })).saleEndAt).toBe(
      performance.saleEndAt,
    );
  });

  it('refuses an early bird that ends before sales open', () => {
    expect(applyPreset('early', performance, { date: '2026-11-20' })).toEqual({
      ok: false,
      reason: 'empty',
    });
    expect(applyPreset('early', performance, {})).toEqual({ ok: false, reason: 'invalid' });
  });

  it('starts the final days at 00:00 venue time N days before the end', () => {
    const window = ok(applyPreset('final', performance, { days: 7 }));
    expect(window.saleStartAt).toBe('2026-12-23T17:00:00.000Z');
    expect(window.saleEndAt).toBe(performance.saleEndAt);
    expect(ok(applyPreset('final', performance)).saleStartAt).toBe(window.saleStartAt);
  });

  it('clamps final days to the start and rejects bad counts', () => {
    expect(ok(applyPreset('final', performance, { days: 30 })).saleStartAt).toBe(
      performance.saleStartAt,
    );
    expect(applyPreset('final', performance, { days: 0 }).ok).toBe(false);
    expect(applyPreset('final', performance, { days: 31 }).ok).toBe(false);
  });

  it('starts later from a chosen date and time', () => {
    const window = ok(applyPreset('later', performance, { date: '2026-12-10T09:30' }));
    expect(window.saleStartAt).toBe('2026-12-10T02:30:00.000Z');
    expect(window.saleEndAt).toBe(performance.saleEndAt);
    expect(applyPreset('later', performance, { date: '2027-01-10T09:30' })).toEqual({
      ok: false,
      reason: 'empty',
    });
  });

  it('handles a zone with daylight saving time', () => {
    const newYork = {
      saleStartAt: '2026-03-01T15:00:00.000Z',
      saleEndAt: '2026-03-20T15:00:00.000Z',
      timezone: 'America/New_York',
    };
    // 7 days before 20 March 11:00 EDT is 13 March 00:00 EST (05:00 UTC).
    expect(ok(applyPreset('final', newYork, { days: 7 })).saleStartAt).toBe(
      '2026-03-13T04:00:00.000Z',
    );
  });

  it('detects the preset that matches stored times and falls back to custom', () => {
    for (const [preset, input] of [
      ['whole', {}],
      ['early', { date: '2026-12-15' }],
      ['final', { days: 7 }],
      ['later', { date: '2026-12-10T09:30' }],
    ] as const) {
      const detected = detectPreset(ok(applyPreset(preset, performance, input)), performance);
      expect(detected).toMatchObject({ preset, ...input });
    }
    expect(
      detectPreset(
        { saleStartAt: '2026-12-02T03:00:00.000Z', saleEndAt: '2026-12-20T05:00:00.000Z' },
        performance,
      ).preset,
    ).toBe('custom');
  });

  it('summarizes the window with the venue timezone', () => {
    const summary = summarizeWindow(performance, performance.timezone, 'en');
    expect(summary).toContain('10:00');
    expect(summary).toContain('20:00');
    expect(summary).toContain('(Asia/Ho_Chi_Minh)');
  });
});
