import { api, apiGet, apiMultipartCommand } from './client';
import type { ConcertTranslations, Page } from './concerts';
import type { ArtistBioJobSubmission } from './management/artistBio';
import type { ManagedEvent } from './performanceManagement';
import type { AgeRating, EventDetails } from './performances';

const root = '/api/organizer/manage/v2';
const admin = '/api/admin/v2';
const key = encodeURIComponent;
const eventPath = (id: string) => root + '/events/' + key(id);

export type RevisionState =
  | 'DRAFTING'
  | 'SUBMITTED'
  | 'CHANGES_REQUESTED'
  | 'REJECTED'
  | 'APPROVED';

/** The text a revision proposes for a released event. */
export type EventContentValue = {
  title: string;
  description: string | null;
  translations: ConcertTranslations;
  artistBio: string | null;
  ageRating: AgeRating | null;
  refundPolicy: string | null;
  classification?: {
    segment: string | null;
    primaryGenre: string | null;
    secondaryGenres: string[];
  } | null;
};

export type ContentRevision = {
  eventId: string;
  revision: number;
  state: RevisionState;
  content: EventContentValue;
  /** The poster buyers would see after approval: the staged one when it changed. */
  posterUrl: string | null;
  posterChanged: boolean;
  reason: string | null;
  submittedAt: string | null;
  decidedAt: string | null;
};

/** The live event and, for a released event, its pending revision. */
export type ContentState = { event: ManagedEvent; revision: ContentRevision | null };

export type RevisionInput = Omit<
  EventContentValue,
  'description' | 'artistBio' | 'refundPolicy' | 'classification'
> & {
  description: string;
  artistBio: string;
  refundPolicy: string;
  segment: string;
  primaryGenre: string;
  genres: string[];
};

export const getEventContent = (id: string, signal?: AbortSignal) =>
  apiGet<ContentState>(eventPath(id) + '/content', signal);

export const stageContentRevision = (id: string, expectedRevision: number, body: RevisionInput) =>
  api.put<unknown, ContentState>(eventPath(id) + '/content-revision', {
    ...body,
    expectedRevision,
  });

export const submitContentRevision = (id: string, expectedRevision: number) =>
  api.post<unknown, ContentState>(eventPath(id) + '/content-revision/submit', {
    expectedRevision,
  });

export const withdrawContentRevision = (id: string) =>
  api.post<unknown, ContentState>(eventPath(id) + '/content-revision/withdraw');

export const discardContentRevision = (id: string) =>
  api.delete<unknown, ContentState>(eventPath(id) + '/content-revision');

type PosterVersions = { expectedVersion?: number; expectedRevision?: number };

function posterQuery({ expectedVersion, expectedRevision }: PosterVersions) {
  const params = new URLSearchParams();
  if (expectedVersion !== undefined) params.set('expectedVersion', String(expectedVersion));
  if (expectedRevision !== undefined) params.set('expectedRevision', String(expectedRevision));
  return params.size ? '?' + params : '';
}

/** Replaces the poster directly on a draft event, or stages it once a performance is released. */
export function uploadEventPoster(id: string, file: File, versions: PosterVersions) {
  const data = new FormData();
  data.set('file', file);
  return api.put<unknown, ContentState>(eventPath(id) + '/poster' + posterQuery(versions), data, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
}

export const removeEventPoster = (id: string, versions: PosterVersions) =>
  api.delete<unknown, ContentState>(eventPath(id) + '/poster' + posterQuery(versions));

/** Private buyer-shaped detail with draft performances; `revision` previews the staged revision. */
export const getEventPreview = (id: string, revision: boolean, signal?: AbortSignal) =>
  apiGet<EventDetails>(eventPath(id) + '/preview' + (revision ? '?revision=true' : ''), signal);

export function submitEventArtistBioJob(eventId: string, file: File) {
  const data = new FormData();
  data.append('file', file);
  return apiMultipartCommand<ArtistBioJobSubmission>(
    'post',
    eventPath(eventId) + '/artist-bio-jobs',
    data,
  );
}

export type ContentQueueRow = {
  eventId: string;
  organizationId: string | null;
  title: string;
  state: RevisionState;
  revision: number;
  submittedAt: string | null;
  reason: string | null;
};

export const getContentRevisionQueue = (state: RevisionState, page: number, signal?: AbortSignal) =>
  apiGet<Page<ContentQueueRow>>(
    admin + '/event-content-revisions?state=' + state + '&page=' + page + '&size=20',
    signal,
  );

export const getContentRevisionReview = (eventId: string, signal?: AbortSignal) =>
  apiGet<ContentState>(admin + '/event-content-revisions/' + key(eventId), signal);

export type ContentDecision = 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';

export const decideContentRevision = (
  eventId: string,
  action: ContentDecision,
  revision: number,
  reason: string,
) =>
  api.post<unknown, ContentState>(
    admin + '/event-content-revisions/' + key(eventId) + '/decision',
    {
      action,
      revision,
      reason,
    },
  );
