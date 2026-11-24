import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { formatCountdown, useCountdown } from './useCountdown';

describe('formatCountdown', () => {
  it('uses minutes and seconds below one hour', () => {
    expect(formatCountdown(0)).toBe('00:00');
    expect(formatCountdown(125)).toBe('02:05');
    expect(formatCountdown(3_599)).toBe('59:59');
  });

  it('adds hours from one hour', () => {
    expect(formatCountdown(3_600)).toBe('1:00:00');
    expect(formatCountdown(7_530)).toBe('2:05:30');
    expect(formatCountdown(36 * 3_600 + 61)).toBe('36:01:01');
  });
});

describe('useCountdown', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-11-24T10:00:00Z'));
  });
  afterEach(() => vi.useRealTimers());

  it('reports hours, warning and expiry', () => {
    const { result, rerender } = renderHook(({ at }) => useCountdown(at, 120), {
      initialProps: { at: '2026-11-24T11:30:05Z' },
    });
    expect(result.current.hours).toBe(1);
    expect(result.current.minutes).toBe(30);
    expect(result.current.formatted).toBe('1:30:05');
    expect(result.current.isWarning).toBe(false);

    rerender({ at: '2026-11-24T10:02:00Z' });
    expect(result.current.isWarning).toBe(true);

    act(() => {
      vi.advanceTimersByTime(120_000);
    });
    expect(result.current.isExpired).toBe(true);
    expect(result.current.isWarning).toBe(false);
  });
});
