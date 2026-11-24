import { api, apiGet } from './client';
import type { Page } from './concerts';
import type { DisruptionImpactPage, DisruptionKind } from './eventDisruptions';

const directory = '/api/admin/v2/performances';
const performance = (id: string) => directory + '/' + encodeURIComponent(id);
const disruption = (id: string) => performance(id) + '/disruption';

export type OperationsPerformance = {
  id: string;
  title: string;
  venueName: string;
  spaceName: string;
  startsAt: string;
  endsAt: string;
  doorsOpenAt: string | null;
  timezone: string;
  saleStartAt: string;
  saleEndAt: string;
  status: 'ON_SALE' | 'SOLD_OUT' | 'CANCELLED' | 'COMPLETED';
  salesSuspended: boolean;
  ticketingAcknowledged: boolean;
  checkinAcknowledged: boolean;
};

export type PerformanceDisruption = {
  id: string;
  kind: DisruptionKind;
  state: 'PAUSING' | 'PAUSED' | 'CANCELLED' | 'RESUMING' | 'RESUMED';
  reason: string;
};

export type PerformanceSchedule = Pick<
  OperationsPerformance,
  'startsAt' | 'endsAt' | 'doorsOpenAt' | 'saleStartAt' | 'saleEndAt'
>;
export type PerformanceDisruptionInput =
  | { kind: 'CANCEL'; reason: string }
  | ({ kind: 'POSTPONE'; reason: string } & PerformanceSchedule);

export function findOperatingPerformances(query: string, page: number, signal: AbortSignal) {
  const params = new URLSearchParams({ query, page: String(page), size: '15' });
  return apiGet<Page<OperationsPerformance>>(directory + '?' + params, signal);
}

export const getOperatingPerformance = (id: string, signal: AbortSignal) =>
  apiGet<OperationsPerformance>(performance(id), signal);

export async function getPerformanceDisruption(id: string, signal: AbortSignal) {
  const operation = await apiGet<PerformanceDisruption | null>(disruption(id), signal);
  // Catalog omits an empty data field when there has been no operation.
  return operation?.id ? operation : null;
}

export const getPerformanceDisruptionImpact = (id: string, page: number, signal: AbortSignal) =>
  apiGet<DisruptionImpactPage>(disruption(id) + '/impact?page=' + page + '&size=10', signal);

export const startPerformanceDisruption = (
  id: string,
  input: PerformanceDisruptionInput,
  actionId: string,
) => api.post<unknown, PerformanceDisruption>(disruption(id), { ...input, actionId });

export const resumePerformanceSales = (id: string, operationId: string) =>
  api.post<unknown, PerformanceDisruption>(
    disruption(id) + '/' + encodeURIComponent(operationId) + '/resume',
  );

export const completePerformance = (id: string) => api.post(disruption(id) + '/complete');
