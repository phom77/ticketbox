import type { StaffConcert } from '../../api/admin';

export const staffDateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function staffConcertLabel(concert: StaffConcert) {
  return `${concert.title} - ${staffDateTime.format(new Date(concert.eventDate))}`;
}

export function selectInitialConcert(concerts: StaffConcert[], preferredId: string | null) {
  if (preferredId && concerts.some((concert) => concert.id === preferredId)) {
    return preferredId;
  }
  return concerts[0]?.id ?? '';
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
