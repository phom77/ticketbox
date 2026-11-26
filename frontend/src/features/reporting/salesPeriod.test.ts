import { describe, expect, it } from 'vitest';
import { periodError, presetOf, presetRange, shiftDate } from './salesPeriod';

describe('sales period', () => {
  it('builds the presets from the reporting date', () => {
    expect(presetRange('today', '2026-12-10')).toEqual({ from: '2026-12-10', to: '2026-12-10' });
    expect(presetRange('last7', '2026-12-10')).toEqual({ from: '2026-12-04', to: '2026-12-10' });
    expect(presetRange('last30', '2026-12-10')).toEqual({ from: '2026-11-11', to: '2026-12-10' });
    expect(presetRange('month', '2026-12-10')).toEqual({ from: '2026-12-01', to: '2026-12-10' });
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('recognises a preset or falls back to custom', () => {
    expect(presetOf('2026-12-04', '2026-12-10', '2026-12-10')).toBe('last7');
    expect(presetOf('2026-12-02', '2026-12-10', '2026-12-10')).toBe('custom');
  });

  it('validates the period next to the picker', () => {
    expect(periodError('2026-12-01', '2026-12-05')).toBeUndefined();
    expect(periodError('2026-02-30', '2026-12-05')).toBe('invalid');
    expect(periodError('', '2026-12-05')).toBe('invalid');
    expect(periodError('2026-12-05', '2026-12-01')).toBe('reversed');
    expect(periodError('2020-01-01', '2026-12-05')).toBe('tooLong');
  });
});
