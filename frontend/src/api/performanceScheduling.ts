import { api, apiGet } from './client';
import type { ManagedPerformance, Venue } from './performanceManagement';

const root = '/api/organizer/manage/v2';
const key = encodeURIComponent;
const performance = (id: string) => root + '/performances/' + key(id);
const venue = (id: string) => root + '/venues/' + key(id);

export type BulkDatesInput = {
  startsAt: string[];
  sourcePerformanceId?: string;
  venueSpaceId?: string;
  durationMinutes?: number;
  doorsBeforeMinutes?: number;
  saleStartAt?: string | null;
  timezone?: string;
};

export const addPerformanceDates = (eventId: string, body: BulkDatesInput) =>
  api.post<unknown, ManagedPerformance[]>(
    root + '/events/' + key(eventId) + '/performances/bulk',
    body,
  );

export const duplicatePerformance = (id: string, startsAt: string) =>
  api.post<unknown, ManagedPerformance>(performance(id) + '/duplicate', { startsAt });

export type PricingTarget = { performanceId: string; expectedSaleVersion: number };
export const applyPricing = (id: string, targets: PricingTarget[]) =>
  api.post<unknown, { performanceId: string; saleVersion: number }[]>(
    performance(id) + '/sale/apply',
    {
      targets,
    },
  );

export type VenueEdit = {
  expectedVersion: number;
  name: string;
  address: string;
  city: string | null;
  timezone: string;
  capacityHint: number | null;
};
export const updateVenue = (id: string, body: VenueEdit) =>
  api.put<unknown, Venue>(venue(id), body);
export const addVenueSpace = (id: string, name: string) =>
  api.post<unknown, Venue>(venue(id) + '/spaces', { name });
export const renameVenueSpace = (id: string, space: string, name: string) =>
  api.put<unknown, Venue>(venue(id) + '/spaces/' + key(space), { name });

export type PauseState = 'PAUSING' | 'PAUSED' | 'RESUMING' | 'RESUMED' | 'SUPERSEDED';
export type SalesPause = {
  id: string;
  state: PauseState;
  reason: string;
  pausedAt: string;
  closedAt: string | null;
  ticketingAcknowledged: boolean;
};
export type RequestState = 'REQUESTED' | 'ACCEPTED' | 'DECLINED' | 'WITHDRAWN';
export type DisruptionRequest = {
  id: string;
  performanceId: string;
  kind: 'CANCEL' | 'POSTPONE';
  reason: string;
  proposedStartsAt: string | null;
  proposedEndsAt: string | null;
  proposedDoorsOpenAt: string | null;
  state: RequestState;
  requestedAt: string;
  decidedAt: string | null;
  decisionReason: string | null;
  disruptionId: string | null;
};
export type SalesState = {
  status: string;
  salesSuspended: boolean;
  ticketingAcknowledged: boolean;
  pause: SalesPause | null;
  request: DisruptionRequest | null;
  disruption: {
    id: string;
    kind: 'CANCEL' | 'POSTPONE';
    state: 'PAUSING' | 'PAUSED' | 'CANCELLED' | 'RESUMING' | 'RESUMED';
    reason: string;
  } | null;
};

export const getSalesState = (id: string, signal?: AbortSignal) =>
  apiGet<SalesState>(performance(id) + '/sales', signal);
export const pauseSales = (id: string, actionId: string, reason: string) =>
  api.post<unknown, SalesPause>(performance(id) + '/sales/pause', { actionId, reason });
export const resumeSales = (id: string, pauseId: string) =>
  api.post<unknown, SalesPause>(performance(id) + '/sales/resume', { pauseId });

export type DisruptionRequestInput = {
  kind: 'CANCEL' | 'POSTPONE';
  reason: string;
  proposedStartsAt?: string;
  proposedEndsAt?: string;
  proposedDoorsOpenAt?: string | null;
  alsoPause: boolean;
};
export const requestDisruption = (id: string, body: DisruptionRequestInput) =>
  api.post<unknown, DisruptionRequest>(performance(id) + '/disruption-requests', body);
export const withdrawDisruptionRequest = (id: string, requestId: string) =>
  api.post<unknown, DisruptionRequest>(
    performance(id) + '/disruption-requests/' + key(requestId) + '/withdraw',
    {},
  );

const queue = '/api/admin/v2/performance-disruption-requests';
export type QueuedRequest = {
  request: DisruptionRequest;
  title: string;
  venueName: string | null;
  startsAt: string;
  endsAt: string;
  timezone: string;
  performanceStatus: string;
};
export const listDisruptionRequests = (state: RequestState, signal?: AbortSignal) =>
  apiGet<QueuedRequest[]>(queue + '?state=' + state, signal);
export const getDisruptionRequest = (id: string, signal?: AbortSignal) =>
  apiGet<QueuedRequest>(queue + '/' + key(id), signal);
export const declineDisruptionRequest = (id: string, reason: string) =>
  api.post<unknown, QueuedRequest>(queue + '/' + key(id) + '/decline', { reason });
