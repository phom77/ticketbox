import { apiGet } from '../client';
import { managementBase } from './scope';
import type { ManagementApiScope } from './scope';

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
