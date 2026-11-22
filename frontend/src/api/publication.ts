import { apiGet, api } from './client';
import type { ConcertDetail, ConcertStatus } from './concerts';
import type { ManagementApiScope } from './admin';

export type PublicationReview = {
  id: string;
  concertId: string;
  title: string;
  state: 'SUBMITTED' | 'CHANGES_REQUESTED' | 'REJECTED' | 'SCHEDULED' | 'RELEASED' | 'HELD' | 'MISSED' | 'SUPERSEDED';
  publishAt: string;
  saleStartAt: string;
  reason: string | null;
  resumeHold: boolean;
  proposedEdit?: {
    details?: { title?: string; description?: string; venueName: string; venueAddress: string;
      original?: { title?: string; description?: string }; translations?: Record<string, { title?: string; description?: string }> };
    poster?: { url: string | null };
    artistBio?: string;
  };
};

export type ReviewDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';

export type Publication = {
  status: ConcertStatus;
  issues: string[];
  versions: { version: number; activationVersion: number | null; ticketingVersion: number; checkinVersion: number };
  review: PublicationReview | null;
  draftEdit: boolean;
};

function path(id: string, scope: ManagementApiScope = 'organizer') {
  return `/api/${scope === 'admin' ? 'admin' : 'organizer/manage'}/concerts/${encodeURIComponent(id)}`;
}

export function getConcertPreview(id: string, signal?: AbortSignal) {
  return apiGet<ConcertDetail>(`${path(id)}/preview`, signal);
}

export function getPublication(id: string, scope: ManagementApiScope, signal?: AbortSignal) {
  return apiGet<Publication>(`${path(id, scope)}/publication`, signal);
}

export function submitPublication(id: string, scope: ManagementApiScope, publishAt: string) {
  return api.post<unknown, Publication>(`${path(id, scope)}/publication`, { publishAt });
}

export function getPublicationQueue(signal?: AbortSignal) {
  return apiGet<PublicationReview[]>('/api/admin/concerts/publication-queue', signal);
}

export function decidePublication(id: string, revision: string, decision: ReviewDecision, reason: string) {
  return api.post<unknown, Publication>(`${path(id, 'admin')}/publication/decision`, { revision, decision, reason });
}

export function holdPublication(id: string, revision: string, reason: string) {
  return api.post<unknown, Publication>(`${path(id, 'admin')}/publication/hold`, { revision, reason });
}
