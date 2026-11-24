import { apiCommand, apiGet, apiMultipartCommand } from '../client';
import type { Page } from '../concerts';
import { managementBase } from './scope';
import type { ManagementApiScope } from './scope';

export type ArtistBioJobStatus = 'PENDING' | 'PROCESSING' | 'DONE' | 'FAILED';

export type ArtistBioJob = {
  id: string;
  concertId: string;
  originalFileName: string;
  status: ArtistBioJobStatus;
  provider: string | null;
  model: string | null;
  extractedCharCount: number | null;
  resultBio: string | null;
  errorMessage: string | null;
  startedAt: string | null;
  completedAt: string | null;
  appliedAt: string | null;
  appliedBy: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ArtistBioJobSubmission = {
  jobId: string;
  status: ArtistBioJobStatus;
  statusUrl: string;
};

export type ArtistBioJobFilters = {
  concertId?: string;
  status?: ArtistBioJobStatus;
  page?: number;
  size?: number;
};

export function submitArtistBioJob(
  concertId: string,
  file: File,
  scope: ManagementApiScope = 'admin',
) {
  const data = new FormData();
  data.append('file', file);
  return apiMultipartCommand<ArtistBioJobSubmission>(
    'post',
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/artist-bio-jobs`,
    data,
  );
}

export function composeArtistBioDraft(
  concertId: string,
  sourceJobIds: string[],
  scope: ManagementApiScope = 'admin',
) {
  return apiCommand<ArtistBioJob>(
    'post',
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/artist-bio-jobs/compose`,
    { sourceJobIds },
  );
}

export function getArtistBioJobs(
  filters: ArtistBioJobFilters = {},
  signal?: AbortSignal,
  scope: ManagementApiScope = 'admin',
) {
  const params = new URLSearchParams({
    page: String(filters.page ?? 0),
    size: String(filters.size ?? 20),
  });
  if (filters.concertId) params.set('concertId', filters.concertId);
  if (filters.status) params.set('status', filters.status);
  return apiGet<Page<ArtistBioJob>>(`${managementBase(scope)}/artist-bio-jobs?${params}`, signal);
}

export function getArtistBioJob(
  jobId: string,
  signal?: AbortSignal,
  scope: ManagementApiScope = 'admin',
) {
  return apiGet<ArtistBioJob>(
    `${managementBase(scope)}/artist-bio-jobs/${encodeURIComponent(jobId)}`,
    signal,
  );
}

export function deleteArtistBioJob(jobId: string, scope: ManagementApiScope = 'admin') {
  return apiCommand<void>(
    'delete',
    `${managementBase(scope)}/artist-bio-jobs/${encodeURIComponent(jobId)}`,
  );
}

export function retryArtistBioJob(jobId: string, scope: ManagementApiScope = 'admin') {
  return apiCommand<ArtistBioJobSubmission>(
    'post',
    `${managementBase(scope)}/artist-bio-jobs/${encodeURIComponent(jobId)}/retry`,
  );
}

export function applyArtistBioJob(
  jobId: string,
  overwrite = false,
  scope: ManagementApiScope = 'admin',
) {
  const params = new URLSearchParams({ overwrite: String(overwrite) });
  return apiCommand<ArtistBioJob>(
    'post',
    `${managementBase(scope)}/artist-bio-jobs/${encodeURIComponent(jobId)}/apply?${params}`,
  );
}

export function publishConcertArtistBio(
  concertId: string,
  artistBio: string,
  scope: ManagementApiScope = 'admin',
) {
  return apiCommand<void>(
    'put',
    `${managementBase(scope)}/concerts/${encodeURIComponent(concertId)}/artist-bio`,
    { artistBio },
  );
}
