import { api } from '../client';
import { apiCommand, apiGet } from '../client';
import type { ConcertStatus, Page } from '../concerts';

// Web staff app client for the performance-scoped admission API. The scanner uses the same routes, so
// the shapes here must follow Check-in's responses. The web app is online only: it never calls
// `checkin-dataset` or `sync`.
const base = '/api/v2/staff/performances';
const scanTimeoutMs = 15_000;

export type StaffPerformance = {
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

export type StaffGuest = {
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
  ticketStatus: string | null;
  referenceCode?: string | null;
  ticketTypeName?: string | null;
};

export type StaffPerformanceOverview = {
  concert: StaffPerformance;
  totalTickets: number;
  validTickets: number;
  usedTickets: number;
  cancelledTickets: number;
  transferredTickets: number;
  totalCheckins: number;
  datasetUpdatedAt: string | null;
};

export type StaffTicket = {
  id: string;
  status: string;
  referenceCode?: string | null;
  ticketTypeName?: string | null;
  sectionLabel?: string | null;
  rowLabel?: string | null;
  seatLabel?: string | null;
};

function pageParams(page: number, size: number, extra: Record<string, string> = {}) {
  return new URLSearchParams({ ...extra, page: String(page), size: String(size) });
}

function path(performanceId: string, suffix = '') {
  return `${base}/${encodeURIComponent(performanceId)}${suffix}`;
}

export function getStaffPerformances(page = 0, size = 100, signal?: AbortSignal) {
  return apiGet<Page<StaffPerformance>>(`${base}?${pageParams(page, size)}`, signal);
}

export function getStaffPerformanceOverview(performanceId: string, signal?: AbortSignal) {
  return apiGet<StaffPerformanceOverview>(path(performanceId, '/overview'), signal);
}

export function getStaffTickets(
  performanceId: string,
  query: string,
  page = 0,
  size = 20,
  signal?: AbortSignal,
) {
  const extra: Record<string, string> = query.trim() ? { query: query.trim() } : {};
  return apiGet<Page<StaffTicket>>(
    path(performanceId, `/tickets?${pageParams(page, size, extra)}`),
    signal,
  );
}

export function getStaffCheckinHistory(
  performanceId: string,
  page = 0,
  size = 20,
  signal?: AbortSignal,
) {
  return apiGet<Page<StaffCheckinHistory>>(
    path(performanceId, `/checkins?${pageParams(page, size)}`),
    signal,
  );
}

export function getStaffGuests(performanceId: string, page = 0, size = 100, signal?: AbortSignal) {
  return apiGet<Page<StaffGuest>>(path(performanceId, `/guests?${pageParams(page, size)}`), signal);
}

export function checkInStaffGuest(performanceId: string, guestId: string, gate: string) {
  return apiCommand<StaffGuest>(
    'post',
    path(performanceId, `/guests/${encodeURIComponent(guestId)}/check-in`),
    { gate },
  );
}

/** Admission needs an answer from Check-in, so a request that takes too long counts as not recorded. */
export function scanStaffTicket(performanceId: string, payload: StaffScanTicketRequest) {
  return api.request<unknown, { data: StaffScanTicketResponse; message: string }>({
    method: 'post',
    url: path(performanceId, '/scan'),
    data: payload,
    preserveEnvelope: true,
    timeout: scanTimeoutMs,
  });
}
