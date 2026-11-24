import { apiCommand, apiGet } from '../client';
import type { ConcertStatus, Page } from '../concerts';

export type StaffConcert = {
  id: string;
  title: string;
  venueName: string;
  venueAddress: string;
  eventDate: string;
  doorsOpenAt: string | null;
  status: Exclude<ConcertStatus, 'DRAFT'>;
  posterUrl: string | null;
};

export type StaffScanTicketRequest = {
  qrCode: string;
  concertId: string;
  deviceId: string;
  gate?: string;
};

export type StaffScanTicketResponse = {
  ticketId: string | null;
  concertId: string;
  status: 'SUCCESS' | 'FAILED';
  message: string;
  checkAt: string;
};

export type StaffGuestLookup = {
  found: boolean;
  guestId: string | null;
  concertId: string | null;
  phone: string | null;
  fullName: string | null;
  category: string | null;
  sponsorName: string | null;
  notes: string | null;
  checkedInAt: string | null;
  checkinGate: string | null;
};

export type StaffCheckinHistory = {
  id: string;
  ticketId: string;
  concertId: string;
  staffId: string;
  deviceId: string;
  checkedAt: string;
  syncAt: string | null;
  offline: boolean;
  gate: string | null;
  notes: string | null;
  qrCode: string | null;
  ticketStatus: string | null;
  referenceCode?: string | null;
  ticketTypeName?: string | null;
};

export function getStaffConcerts(status: StaffConcert['status'] = 'ON_SALE', signal?: AbortSignal) {
  const params = new URLSearchParams({ status, page: '0', size: '20' });
  return apiGet<Page<StaffConcert>>(`/api/staff/concerts?${params}`, signal);
}

export function scanStaffTicket(payload: StaffScanTicketRequest) {
  return apiCommand<StaffScanTicketResponse>('post', '/api/staff/checkins/scan', payload);
}

export function lookupStaffGuest(concertId: string, phone: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ concert_id: concertId, phone });
  return apiGet<StaffGuestLookup>(`/api/staff/guestlist?${params}`, signal);
}

export function getStaffGuestList(concertId: string, signal?: AbortSignal) {
  const params = new URLSearchParams({ concert_id: concertId });
  return apiGet<StaffGuestLookup[]>(`/api/staff/guestlist/list?${params}`, signal);
}

export function checkInStaffGuest(guestId: string, concertId: string, gate = 'VIP') {
  return apiCommand<StaffGuestLookup>(
    'post',
    `/api/staff/guestlist/${encodeURIComponent(guestId)}/check-in`,
    { concertId, gate },
  );
}

export function getStaffCheckinHistory(
  concertId: string,
  page = 0,
  size = 20,
  signal?: AbortSignal,
) {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  return apiGet<Page<StaffCheckinHistory>>(
    `/api/staff/concerts/${encodeURIComponent(concertId)}/checkins?${params}`,
    signal,
  );
}
