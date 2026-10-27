import { requestJson } from '../client';
import type {
  CheckinDatasetResponse,
  PageResponse,
  ScanTicketRequestPayload,
  ScanTicketResponse,
  ServerCheckinHistory,
  StaffConcert,
  StaffConcertOverview,
  StaffTicket,
  SyncCheckinRequestPayload,
  SyncCheckinResponse,
  StaffGuestListEntry,
} from '../types';

export function getStaffGuestList(concertId: string, token?: string) {
  return requestJson<StaffGuestListEntry[]>(`/staff/guestlist/list?concert_id=${concertId}`, {
    token,
  });
}

export function checkInStaffGuest(
  guestId: string,
  payload: { concertId: string; gate?: string | null },
  token?: string,
) {
  return requestJson<StaffGuestListEntry>(`/staff/guestlist/${guestId}/check-in`, {
    method: 'POST',
    token,
    body: payload,
  });
}

export function getStaffConcerts(token?: string) {
  return requestJson<PageResponse<StaffConcert>>(
    '/staff/concerts?status=ON_SALE&page=0&size=100',
    { token },
  );
}

export function getStaffConcertOverview(concertId: string, token?: string) {
  return requestJson<StaffConcertOverview>(`/staff/concerts/${concertId}/overview`, { token });
}

export function getCheckinDataset(concertId: string, token?: string) {
  return requestJson<CheckinDatasetResponse>(`/staff/concerts/${concertId}/checkin-dataset`, {
    token,
  });
}

export function syncCheckinLogs(payload: SyncCheckinRequestPayload, token?: string) {
  return requestJson<SyncCheckinResponse>('/staff/checkins/sync', {
    method: 'POST',
    token,
    body: payload,
  });
}

export function scanTicketOnline(payload: ScanTicketRequestPayload, token?: string) {
  return requestJson<ScanTicketResponse>('/staff/checkins/scan', {
    method: 'POST',
    token,
    body: payload,
  });
}

export function getStaffTickets(
  concertId: string,
  options: { query?: string; status?: StaffTicket['status']; page?: number; size?: number } = {},
  token?: string,
) {
  const params = new URLSearchParams();
  params.set('page', String(options.page ?? 0));
  params.set('size', String(options.size ?? 100));
  if (options.query?.trim()) {
    params.set('query', options.query.trim());
  }
  if (options.status) {
    params.set('status', options.status);
  }

  return requestJson<PageResponse<StaffTicket>>(
    `/staff/concerts/${concertId}/tickets?${params.toString()}`,
    { token },
  );
}

export function getCheckinHistory(
  concertId: string,
  options: { page?: number; size?: number } = {},
  token?: string,
) {
  const params = new URLSearchParams({
    page: String(options.page ?? 0),
    size: String(options.size ?? 100),
  });
  return requestJson<PageResponse<ServerCheckinHistory>>(
    `/staff/concerts/${concertId}/checkins?${params.toString()}`,
    { token },
  );
}
