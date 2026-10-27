import { apiGet } from './client';

export type TicketStatus = 'VALID' | 'USED' | 'CANCELLED' | 'TRANSFERRED';

export type Ticket = {
  id: string;
  concertId: string;
  concertTitle: string;
  ticketTypeId: string;
  ticketTypeName: string;
  qrCode: string;
  status: TicketStatus;
  issuedAt: string;
};

export function getMyTickets(signal?: AbortSignal) {
  return apiGet<Ticket[]>('/api/tickets', signal);
}

export function getTicket(ticketId: string, signal?: AbortSignal) {
  return apiGet<Ticket>(`/api/tickets/${encodeURIComponent(ticketId)}`, signal);
}
