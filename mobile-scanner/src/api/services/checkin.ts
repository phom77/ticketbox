import { requestJson } from '../client';
import type {
  CheckinDatasetResponse,
  PageResponse,
  ScanTicketRequestPayload,
  ScanTicketResponse,
  ServerCheckinHistory,
  StaffConcert,
  StaffConcertOverview,
  StaffScope,
  StaffTicket,
  SyncCheckinRequestPayload,
  SyncCheckinResponse,
  StaffGuestListEntry,
} from '../types';

const PERFORMANCES = '/v2/staff/performances';
type Membership = { id: string; grants: string[] };

export async function getStaffGuestList(concertId: string, scope: StaffScope) {
  return readPages<StaffGuestListEntry>(`${performance(concertId)}/guests`, scope);
}

export function checkInStaffGuest(
  guestId: string,
  payload: { concertId: string; gate?: string | null },
  scope: StaffScope,
) {
  return requestJson<StaffGuestListEntry>(
    `${performance(payload.concertId)}/guests/${encodeURIComponent(guestId)}/check-in`,
    { ...scope, method: 'POST', body: { gate: payload.gate } },
  );
}

export async function getStaffConcerts(token?: string) {
  const organizations = await requestJson<Membership[]>('/organizations', { token });
  const results = await Promise.all(organizations.filter((org) => org.grants.includes('ADMISSION'))
    .map(async ({ id }) => {
      const shows = await readPages<Omit<StaffConcert, 'organizationId'>>(PERFORMANCES, { token, organizationId: id });
      return shows.map((show) => ({ ...show, organizationId: id }));
    }));
  return results.flat().sort((left, right) => left.eventDate.localeCompare(right.eventDate) || left.id.localeCompare(right.id));
}

export async function getStaffConcertOverview(concertId: string, scope: StaffScope) {
  const result = await requestJson<StaffConcertOverview>(`${performance(concertId)}/overview`, scope);
  return { ...result, concert: { ...result.concert, organizationId: scope.organizationId } };
}

export function getCheckinDataset(concertId: string, scope: StaffScope) {
  return requestJson<CheckinDatasetResponse>(`${performance(concertId)}/checkin-dataset`, scope);
}

export function syncCheckinLogs({ concertId, ...body }: SyncCheckinRequestPayload, scope: StaffScope) {
  return requestJson<SyncCheckinResponse>(`${performance(concertId)}/sync`, {
    ...scope, method: 'POST', body,
  });
}

export function scanTicketOnline({ concertId, ...body }: ScanTicketRequestPayload, scope: StaffScope) {
  return requestJson<ScanTicketResponse>(`${performance(concertId)}/scan`, {
    ...scope, method: 'POST', body,
  });
}

export function getStaffTickets(
  concertId: string,
  options: { query?: string; status?: StaffTicket['status']; page?: number; size?: number },
  scope: StaffScope,
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
  return requestJson<PageResponse<StaffTicket>>(`${performance(concertId)}/tickets?${params}`, scope);
}

export function getCheckinHistory(
  concertId: string,
  options: { page?: number; size?: number },
  scope: StaffScope,
) {
  const params = new URLSearchParams({
    page: String(options.page ?? 0),
    size: String(options.size ?? 100),
  });
  return requestJson<PageResponse<ServerCheckinHistory>>(`${performance(concertId)}/checkins?${params}`, scope);
}

function performance(id: string) {
  return `${PERFORMANCES}/${encodeURIComponent(id)}`;
}

async function readPages<T>(path: string, scope: StaffScope) {
  const items: T[] = [];
  let page = 0;
  for (;;) {
    const result = await requestJson<PageResponse<T>>(`${path}?page=${page}&size=100`, scope);
    items.push(...result.content);
    if (result.last || !result.content.length) return items;
    page += 1;
  }
}
