import { apiGet } from '../client';
import type { Page } from '../concerts';
import { managementBase } from './scope';
import type { ManagementApiScope } from './scope';

export type CheckinGate = {
  /** null when staff entered no gate. */
  gate: string | null;
  checkedIn: number;
  latestCheckedAt: string | null;
};

export type CheckinSummary = {
  concertId: string;
  totalTickets: number;
  validTickets: number;
  usedTickets: number;
  cancelledTickets: number;
  transferredTickets: number;
  checkedIn: number;
  onlineCheckins: number;
  offlineCheckins: number;
  latestCheckedAt: string | null;
  datasetUpdatedAt: string | null;
  gates: CheckinGate[];
  guestsTotal: number;
  guestsCheckedIn: number;
};

/** One admission as organizers see it: never carries the QR value or device id. */
export type PerformanceAdmission = {
  id: string;
  ticketId: string;
  concertId: string;
  staffId: string;
  checkedAt: string;
  syncAt: string | null;
  offline: boolean;
  gate: string | null;
  ticketStatus: string | null;
  referenceCode?: string | null;
  ticketTypeName?: string | null;
};

export function getAdminCheckinSummary(concertId: string, signal?: AbortSignal) {
  return apiGet<CheckinSummary>(
    `/api/admin/concerts/${encodeURIComponent(concertId)}/checkin-summary`,
    signal,
  );
}

export function getManagedCheckinSummary(
  concertId: string,
  signal?: AbortSignal,
  scope: ManagementApiScope = 'admin',
) {
  return apiGet<CheckinSummary>(
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/checkin-summary`,
    signal,
  );
}

export function getPerformanceAdmissions(
  performanceId: string,
  size = 10,
  signal?: AbortSignal,
  page = 0,
) {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  return apiGet<Page<PerformanceAdmission>>(
    `/api/organizer/manage/v2/performances/${encodeURIComponent(performanceId)}/checkins?${params}`,
    signal,
  );
}
