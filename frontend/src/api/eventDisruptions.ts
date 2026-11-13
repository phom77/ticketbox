import { apiCommand, apiGet } from './client';

export type DisruptionKind = 'CANCEL' | 'POSTPONE';

export type EventDisruption = {
  id: string;
  kind: DisruptionKind;
  state: 'PAUSING' | 'PAUSED' | 'CANCELLED' | 'RESUMING' | 'RESUMED';
  reason: string;
  eventDate: string | null;
  ticketingReady: boolean;
  checkinReady: boolean;
  processed: boolean;
};

export type DisruptionImpactPage = {
  content: { orderId: string; status: string; paymentState: string | null; amount: number; casePrepared: boolean }[];
  page: number;
  size: number;
  totalElements: number;
  totalPages: number;
};

export type DisruptionCommand = {
  actionId: string;
  kind: DisruptionKind;
  reason: string;
  eventDate?: string;
  doorsOpenAt?: string;
  saleStartAt?: string;
  saleEndAt?: string;
};

function disruptionPath(concertId: string) {
  return `/api/admin/concerts/${encodeURIComponent(concertId)}/disruption`;
}

export async function getDisruption(concertId: string, signal: AbortSignal) {
  const result = await apiGet<EventDisruption | null>(disruptionPath(concertId), signal);
  // Catalog omits the data field when there is no operation.
  return result?.id ? result : null;
}

export function getDisruptionImpact(concertId: string, page: number, signal: AbortSignal) {
  const query = new URLSearchParams({ page: String(page), size: '10' });
  return apiGet<DisruptionImpactPage>(`${disruptionPath(concertId)}/impact?${query}`, signal);
}

export function startDisruption(concertId: string, command: DisruptionCommand) {
  return apiCommand<EventDisruption>('POST', disruptionPath(concertId), command);
}

export function resumeDisruption(concertId: string, operationId: string) {
  return apiCommand<EventDisruption>('POST', `${disruptionPath(concertId)}/${encodeURIComponent(operationId)}/resume`);
}
