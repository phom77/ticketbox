import { apiGet, apiMultipartCommand } from '../client';
import type { Page } from '../concerts';
import { managementBase } from './scope';
import type { ManagementApiScope } from './scope';

export type BatchLogStatus = 'PENDING' | 'RUNNING' | 'SUCCESS' | 'PARTIAL' | 'FAILED' | 'SKIPPED';
export type BatchLogSource = 'UPLOAD' | 'SCHEDULED';

export type BatchLog = {
  id: string;
  jobName: string;
  concertId: string | null;
  source: BatchLogSource | null;
  fileName: string | null;
  checksum: string | null;
  status: BatchLogStatus;
  startedAt: string;
  completedAt: string | null;
  totalRows: number;
  successRows: number;
  errorRows: number;
  errorDetail: string | null;
  filePath: string | null;
  errorReportPath: string | null;
};

export type GuestListImportResponse = {
  batchLogId: string;
  status: BatchLogStatus;
  statusUrl: string;
};

export type GuestListEntry = {
  id: string;
  concertId: string;
  phone: string;
  fullName: string;
  category: string | null;
  sponsorName: string | null;
  notes: string | null;
  active: boolean;
  importedAt: string | null;
  batchFile: string | null;
  checkedInAt: string | null;
  checkinGate: string | null;
};

export type BatchLogFilters = {
  concertId?: string;
  status?: BatchLogStatus;
  source?: BatchLogSource;
  page?: number;
  size?: number;
};

export function importGuestList(
  concertId: string,
  file: File,
  scope: ManagementApiScope = 'admin',
  scheduled = false,
) {
  const data = new FormData();
  data.append('file', file);
  const path = scheduled
    ? `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/guest-lists/schedule`
    : `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/guest-lists/import`;
  return apiMultipartCommand<GuestListImportResponse>('post', path, data);
}

export function getConcertGuestList(
  concertId: string,
  page = 0,
  size = 20,
  signal?: AbortSignal,
  scope: ManagementApiScope = 'admin',
  filters: { query?: string; activeOnly?: boolean } = {},
) {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (filters.query?.trim()) params.set('query', filters.query.trim());
  if (filters.activeOnly) params.set('activeOnly', 'true');
  return apiGet<Page<GuestListEntry>>(
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/guest-lists?${params}`,
    signal,
  );
}

export function getBatchLogs(
  filters: BatchLogFilters = {},
  signal?: AbortSignal,
  scope: ManagementApiScope = 'admin',
) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 0),
    size: String(filters.size ?? 20),
  });
  if (filters.concertId) params.set('concertId', filters.concertId);
  if (filters.status) params.set('status', filters.status);
  if (filters.source) params.set('source', filters.source);
  return apiGet<Page<BatchLog>>(`${managementBase(scope)}/batch-logs?${params}`, signal);
}

export function getBatchLog(
  batchLogId: string,
  signal?: AbortSignal,
  scope: ManagementApiScope = 'admin',
) {
  return apiGet<BatchLog>(
    `${managementBase(scope)}/batch-logs/${encodeURIComponent(batchLogId)}`,
    signal,
  );
}
