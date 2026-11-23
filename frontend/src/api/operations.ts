import type { ManagementApiScope } from './admin';
import { apiGet } from './client';
import type { PerformanceReview } from './performanceManagement';
import type { PublicationReview } from './publication';

export type OperationsPage<T> = {
  content: T[];
  totalElements: number;
  totalPages: number;
  number: number;
  size: number;
};

export type OperationsEventRow = {
  id: string;
  title: string;
  description: string | null;
  category: string | null;
  organizationId: string | null;
  legacyConcertId: string | null;
  performanceCount: number;
  preparing: boolean;
  changesRequested: boolean;
  nextStartsAt: string | null;
  actionPerformanceId: string | null;
  changeReason: string | null;
};

export type OperationsPerformanceRow = {
  id: string;
  eventId: string;
  title: string;
  organizationId: string | null;
  legacyConcertId: string | null;
  venueName: string | null;
  spaceName: string | null;
  startsAt: string | null;
  endsAt: string | null;
  timezone: string;
  status: string;
  salesSuspended: boolean;
  publicVisible: boolean;
  saleStartAt: string | null;
  saleEndAt: string | null;
  publicationStatus: string | null;
  ticketingAcknowledged: boolean | null;
  checkinAcknowledged: boolean | null;
};

export type OperationsReviewRow = {
  id: string;
  revision: string;
  model: 'LEGACY' | 'PERFORMANCE';
  eventId: string;
  performanceId: string;
  legacyConcertId: string | null;
  organizationId: string | null;
  title: string;
  status: PublicationReview['state'];
  submittedAt: string;
  publishAt: string;
  reason: string | null;
};

type PageFilters = { page?: number; size?: number };
type EventFilters = PageFilters & { query?: string; organizationId?: string; status?: string };
export type OperationsReportFilters = PageFilters & {
  eventId?: string;
  performanceId?: string;
  concertId?: string;
  organizationId?: string;
  from?: string;
  to?: string;
  status?: string;
  asOf?: string;
};
type ReviewFilters = EventFilters & Pick<OperationsReportFilters, 'eventId' | 'performanceId' | 'concertId'>;

function readPage<T>(path: string, filters: Record<string, string | number | undefined>, signal?: AbortSignal) {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(filters)) {
    if (value !== undefined && value !== '') params.set(name, String(value));
  }
  return apiGet<OperationsPage<T>>(params.size ? `${path}?${params}` : path, signal);
}

export function getOperationsEvents(scope: ManagementApiScope, filters: EventFilters, signal?: AbortSignal) {
  const path = scope === 'admin' ? '/api/admin/v2/events' : '/api/organizer/manage/v2/event-directory';
  return readPage<OperationsEventRow>(path, filters, signal);
}

export function getOperationsEvent(id: string, signal?: AbortSignal) {
  return apiGet<OperationsEventRow & { performances: OperationsPerformanceRow[] }>(
    '/api/admin/v2/events/' + encodeURIComponent(id), signal,
  );
}

export function getOperationsReport(scope: ManagementApiScope, filters: OperationsReportFilters, signal?: AbortSignal) {
  const root = scope === 'admin' ? '/api/admin/v2' : '/api/organizer/manage/v2';
  return readPage<OperationsPerformanceRow>(root + '/operations-report', filters, signal);
}

export function getOperationsReviews(filters: ReviewFilters, signal?: AbortSignal) {
  return readPage<OperationsReviewRow>('/api/admin/v2/review-directory', filters, signal);
}

export function getOperationsPerformanceReview(id: string, signal?: AbortSignal) {
  return apiGet<PerformanceReview>('/api/admin/v2/performance-reviews/' + encodeURIComponent(id), signal);
}
