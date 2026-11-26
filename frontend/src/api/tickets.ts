import { apiCommand, apiGet } from './client';

export type TicketStatus = 'VALID' | 'USED' | 'CANCELLED' | 'TRANSFERRED';

export type Ticket = {
  id: string;
  referenceCode?: string | null;
  concertId: string;
  concertTitle: string;
  ticketTypeId: string;
  ticketTypeName: string;
  qrCode: string;
  status: TicketStatus;
  issuedAt: string;
  performanceId?: string | null;
  eventId?: string | null;
  performanceVenueName?: string | null;
  performanceStartsAt?: string | null;
  sectionLabel?: string | null;
  rowLabel?: string | null;
  seatLabel?: string | null;
};

export function getMyTickets(signal?: AbortSignal) {
  return apiGet<Ticket[]>('/api/tickets', signal);
}

export function getTicket(ticketId: string, signal?: AbortSignal) {
  return apiGet<Ticket>(`/api/tickets/${encodeURIComponent(ticketId)}`, signal);
}

export type TransferStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'CANCELLED' | 'EXPIRED';
export type TransferBlocker = 'NOT_VALID' | 'RECEIVED' | 'CUTOFF' | 'REFUND_HOLD' | 'DISRUPTED';

/** A transfer as the signed-in person sees it. The other person is shown by display name only. */
export type TicketTransfer = {
  id: string;
  ticketId: string;
  orderId: string;
  role: 'SENT' | 'RECEIVED';
  status: TransferStatus;
  otherPartyName: string;
  concertId: string;
  concertTitle: string;
  eventDate?: string | null;
  ticketTypeName?: string | null;
  venueName?: string | null;
  sectionLabel?: string | null;
  rowLabel?: string | null;
  seatLabel?: string | null;
  createdAt: string;
  expiresAt: string;
  decidedAt?: string | null;
  newTicketId?: string | null;
};

export type TransferState = {
  canTransfer: boolean;
  blockedReason?: TransferBlocker | null;
  cutoffAt?: string | null;
  pending?: TicketTransfer | null;
  receivedFromName?: string | null;
  transferredToName?: string | null;
};

export function getTransferState(ticketId: string, signal?: AbortSignal) {
  return apiGet<TransferState>(
    `/api/tickets/${encodeURIComponent(ticketId)}/transfer-state`,
    signal,
  );
}

export function getMyTransfers(signal?: AbortSignal) {
  return apiGet<TicketTransfer[]>('/api/tickets/transfers', signal);
}

export function getTransfer(transferId: string, signal?: AbortSignal) {
  return apiGet<TicketTransfer>(`/api/tickets/transfers/${encodeURIComponent(transferId)}`, signal);
}

export async function lookupTransferRecipient(ticketId: string, email: string) {
  const result = await apiCommand<{ displayName: string }>(
    'POST',
    `/api/tickets/${encodeURIComponent(ticketId)}/transfer-recipient`,
    { email },
  );
  return result.data;
}

export async function offerTransfer(ticketId: string, email: string) {
  const result = await apiCommand<TicketTransfer>(
    'POST',
    `/api/tickets/${encodeURIComponent(ticketId)}/transfers`,
    { email },
  );
  return result.data;
}

export type TransferAction = 'accept' | 'decline' | 'cancel';

export async function decideTransfer(transferId: string, action: TransferAction) {
  const result = await apiCommand<TicketTransfer>(
    'POST',
    `/api/tickets/transfers/${encodeURIComponent(transferId)}/${action}`,
  );
  return result.data;
}
