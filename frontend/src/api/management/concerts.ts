import { apiCommand, apiGet, apiMultipartCommand } from '../client';
import type {
  ConcertText,
  ConcertTranslations,
  ConcertDetail,
  ConcertStatus,
  Page,
} from '../concerts';
import { managementBase } from './scope';
import type { ManagementApiScope } from './scope';

export type ConcertMutation = {
  title: string;
  description: string | null;
  original?: ConcertText | null;
  translations?: ConcertTranslations;
  venueName: string;
  venueAddress: string;
  eventDate: string;
  doorsOpenAt: string | null;
  saleStartAt: string;
  saleEndAt: string | null;
  seatMapSvg: string | null;
};

export function getAdminConcerts(
  page = 0,
  size = 20,
  status?: ConcertStatus,
  signal?: AbortSignal,
  scope: ManagementApiScope = 'admin',
  query?: string,
) {
  const params = new URLSearchParams({ page: String(page), size: String(size) });
  if (status) params.set('status', status);
  if (query?.trim()) params.set('query', query.trim());
  return apiGet<Page<ConcertDetail>>(`${managementBase(scope)}/concerts?${params}`, signal);
}

export function getManagedConcert(
  concertId: string,
  signal?: AbortSignal,
  scope: ManagementApiScope = 'admin',
) {
  return apiGet<ConcertDetail>(
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}`,
    signal,
  );
}

export function createConcert(
  payload: ConcertMutation,
  scope: ManagementApiScope = 'admin',
  organizationId?: string,
) {
  const owner =
    scope === 'admin' && organizationId
      ? `?organizationId=${encodeURIComponent(organizationId)}`
      : '';
  return apiCommand<ConcertDetail>('post', `${managementBase(scope)}/concerts${owner}`, payload);
}

export function updateConcert(
  concertId: string,
  payload: ConcertMutation,
  scope: ManagementApiScope = 'admin',
) {
  return apiCommand<ConcertDetail>(
    'put',
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}`,
    payload,
  );
}

export function updateConcertStatus(
  concertId: string,
  status: ConcertStatus,
  scope: ManagementApiScope = 'admin',
) {
  return apiCommand<ConcertDetail>(
    'patch',
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/status`,
    { status },
  );
}

export function deleteConcert(concertId: string, scope: ManagementApiScope = 'admin') {
  return apiCommand<void>(
    'delete',
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}`,
  );
}

export function uploadConcertPoster(
  concertId: string,
  file: File,
  scope: ManagementApiScope = 'admin',
) {
  const data = new FormData();
  data.append('file', file);
  return apiMultipartCommand<ConcertDetail>(
    'put',
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/poster`,
    data,
  );
}

export function removeConcertPoster(concertId: string, scope: ManagementApiScope = 'admin') {
  return apiCommand<ConcertDetail>(
    'delete',
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/poster`,
  );
}
