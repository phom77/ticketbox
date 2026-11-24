import { useCallback, useSyncExternalStore } from 'react';

export type Theme = 'light' | 'dark';

// The key predates the buyer theme; keeping it carries an existing choice across both layouts.
export const themePreferenceKey = 'ticketbox.workspace.theme';

const listeners = new Set<() => void>();
let sessionTheme: Theme | null = null;

function savedTheme(): Theme | null {
  try {
    const saved = window.localStorage.getItem(themePreferenceKey);
    return saved === 'light' || saved === 'dark' ? saved : null;
  } catch {
    return null;
  }
}

function systemTheme(): Theme {
  return typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
    ? 'dark'
    : 'light';
}

export function readTheme(): Theme {
  return sessionTheme ?? savedTheme() ?? systemTheme();
}

export function selectTheme(next: Theme) {
  sessionTheme = next;
  try {
    window.localStorage.setItem(themePreferenceKey, next);
  } catch {
    // The choice still applies for the rest of this session.
  }
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  function storageChanged(event: StorageEvent) {
    if (event.key !== themePreferenceKey) return;
    sessionTheme = null;
    listener();
  }
  window.addEventListener('storage', storageChanged);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', storageChanged);
  };
}

/** The device-wide light/dark preference shared by the buyer site and the workspaces. */
export function useThemePreference() {
  const theme = useSyncExternalStore(subscribe, readTheme, () => 'light' as Theme);
  const toggleTheme = useCallback(() => selectTheme(readTheme() === 'dark' ? 'light' : 'dark'), []);
  return { theme, dark: theme === 'dark', toggleTheme };
}

/** Test helper: forget the in-memory session choice. */
export function resetThemeForTests() {
  sessionTheme = null;
}
