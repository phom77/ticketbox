import { apiGet, api } from './client';
import type { ConcertDetail, ConcertStatus } from './concerts';

export type Publication = {
  status: ConcertStatus;
  issues: string[];
  versions: { version: number; activationVersion: number | null; ticketingVersion: number; checkinVersion: number };
};

function path(id: string) {
  return `/api/organizer/manage/concerts/${encodeURIComponent(id)}`;
}

export function getConcertPreview(id: string, signal?: AbortSignal) {
  return apiGet<ConcertDetail>(`${path(id)}/preview`, signal);
}

export function getPublication(id: string, signal?: AbortSignal) {
  return apiGet<Publication>(`${path(id)}/publication`, signal);
}

export function publishConcert(id: string) {
  return api.post<unknown, Publication>(`${path(id)}/publication`);
}
