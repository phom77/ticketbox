import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readTheme,
  resetThemeForTests,
  themePreferenceKey,
  useThemePreference,
} from './useThemePreference';

function mockSystemDark(dark: boolean) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockImplementation((query: string) => ({
      matches: dark && query.includes('dark'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    })),
  );
}

describe('useThemePreference', () => {
  beforeEach(() => {
    window.localStorage.clear();
    resetThemeForTests();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('follows the system preference on first use', () => {
    mockSystemDark(true);
    expect(readTheme()).toBe('dark');
    mockSystemDark(false);
    expect(readTheme()).toBe('light');
  });

  it('remembers an explicit choice on the device', () => {
    mockSystemDark(false);
    const { result } = renderHook(() => useThemePreference());
    expect(result.current.theme).toBe('light');
    act(() => result.current.toggleTheme());
    expect(result.current.theme).toBe('dark');
    expect(window.localStorage.getItem(themePreferenceKey)).toBe('dark');
  });

  it('keeps the choice for the session when storage is blocked', () => {
    mockSystemDark(false);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked');
    });
    const { result } = renderHook(() => useThemePreference());
    act(() => result.current.toggleTheme());
    expect(result.current.dark).toBe(true);
  });
});
