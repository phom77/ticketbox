import { useState } from 'react';
import { ApiClientError } from '../../api/client';
import type { StaffPerformance } from '../../api/admin';
import { formatLanguage } from '../../i18n';

/** Staff see times in their browser zone: the frozen staff API does not carry the venue timezone. */
export function staffDateTime(value: string) {
  return new Intl.DateTimeFormat(formatLanguage(), {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  }).format(new Date(value));
}

export function sortPerformances(performances: StaffPerformance[]) {
  return [...performances].sort((a, b) => Date.parse(a.eventDate) - Date.parse(b.eventDate));
}

const dayMs = 24 * 60 * 60 * 1000;

export function splitEarlier(performances: StaffPerformance[], now = Date.now()) {
  const sorted = sortPerformances(performances);
  return {
    current: sorted.filter((entry) => Date.parse(entry.eventDate) >= now - dayMs),
    earlier: sorted.filter((entry) => Date.parse(entry.eventDate) < now - dayMs),
  };
}

/** The assignment was revoked or the Admission permission was lost. Other 4xx answers are about the request. */
export function isAccessDenied(error: unknown) {
  return error instanceof ApiClientError && (error.status === 401 || error.status === 403);
}

export function getOrCreateStaffDeviceId() {
  const key = 'ticketbox.staffWebDeviceId';
  const existing = readCookie(key);
  if (existing) return existing;
  const next = `staff-web-${crypto.randomUUID()}`;
  document.cookie = `${key}=${encodeURIComponent(next)}; Path=/; Max-Age=${60 * 60 * 24 * 365}; SameSite=Lax`;
  return next;
}

function readCookie(name: string) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix));
  return cookie ? decodeURIComponent(cookie.slice(prefix.length)) : null;
}

/** The gate is remembered per performance for this browser session. */
export function useStaffGate(performanceId: string) {
  const key = `ticketbox.staff.gate.${performanceId}`;
  const [gate, setGateState] = useState(() => {
    try {
      return window.sessionStorage.getItem(key) ?? 'WEB';
    } catch {
      return 'WEB';
    }
  });
  function setGate(next: string) {
    setGateState(next);
    try {
      window.sessionStorage.setItem(key, next);
    } catch {
      // The gate stays for this page view.
    }
  }
  return [gate, setGate] as const;
}
