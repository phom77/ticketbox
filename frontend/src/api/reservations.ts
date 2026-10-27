import { api } from './client';

export type TicketHold = {
  ticketTypeId: string;
  quantity: number;
  expiresAt?: string | null;
};

type ReservationResponse = TicketHold | {
  holds?: TicketHold[];
  ticketTypeId?: string;
  quantity?: number;
  expiresAt?: string | null;
};

function queueHeaders(queueAccessToken?: string) {
  return queueAccessToken ? { 'Queue-Access-Token': queueAccessToken } : undefined;
}

export function reserveTicket(
  concertId: string,
  ticketTypeId: string,
  quantity = 1,
  queueAccessToken?: string,
) {
  return api.post<unknown, ReservationResponse>(
    `/api/reservations/concerts/${encodeURIComponent(concertId)}/ticket-types/${encodeURIComponent(ticketTypeId)}/reserve`,
    { quantity },
    { headers: queueHeaders(queueAccessToken) },
  );
}

export function releaseTicket(
  concertId: string,
  ticketTypeId: string,
  quantity = 1,
  queueAccessToken?: string,
) {
  return api.post<unknown, ReservationResponse>(
    `/api/reservations/concerts/${encodeURIComponent(concertId)}/ticket-types/${encodeURIComponent(ticketTypeId)}/release`,
    { quantity },
    { headers: queueHeaders(queueAccessToken) },
  );
}

export function getCurrentHolds(concertId: string, queueAccessToken?: string, signal?: AbortSignal) {
  return api.get<unknown, TicketHold[]>(
    `/api/reservations/concerts/${encodeURIComponent(concertId)}/holds`,
    { headers: queueHeaders(queueAccessToken), signal },
  );
}

export function releaseAllHolds(concertId: string, queueAccessToken?: string) {
  return api.delete<unknown, void>(
    `/api/reservations/concerts/${encodeURIComponent(concertId)}/holds`,
    { headers: queueHeaders(queueAccessToken) },
  );
}
