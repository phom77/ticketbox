import type { ServerCheckinHistory, StaffTicket } from '../../api';
import type { LocalCheckinLog } from '../../database';
import { localAdmissionStatus } from './status';

export type HistoryEntry = {
  id: string;
  referenceCode?: string | null;
  ticketTypeName?: string | null;
  qrCode?: string;
  gate: string | null;
  checkedAt: string;
  status: 'confirmed' | 'pending' | 'conflict' | 'failed';
  source: 'device' | 'server';
};

export type HistoryTicket = Pick<StaffTicket, 'qrCode' | 'ticketId' | 'referenceCode' | 'ticketTypeName'>;

export function mergeHistory(
  local: LocalCheckinLog[],
  server: ServerCheckinHistory[],
  tickets: HistoryTicket[],
): HistoryEntry[] {
  const ticketIndex = new Map<string, HistoryTicket>();
  for (const ticket of tickets) {
    const saved = ticketIndex.get(ticket.qrCode);
    ticketIndex.set(ticket.qrCode, {
      ...ticket,
      referenceCode: ticket.referenceCode ?? saved?.referenceCode,
      ticketTypeName: ticket.ticketTypeName ?? saved?.ticketTypeName,
    });
  }
  const serverTicketIds = new Set(server.map((entry) => entry.ticketId));
  const serverCodes = new Set(server.map((entry) => entry.qrCode));
  const entries: HistoryEntry[] = server.map((entry) => {
    const saved = entry.qrCode ? ticketIndex.get(entry.qrCode) : undefined;
    return {
      id: `server:${entry.id}`,
      referenceCode: entry.referenceCode ?? saved?.referenceCode,
      ticketTypeName: entry.ticketTypeName ?? saved?.ticketTypeName,
      qrCode: entry.qrCode ?? undefined,
      gate: entry.gate,
      checkedAt: entry.checkedAt,
      status: 'confirmed',
      source: 'server',
    };
  });

  for (const entry of local) {
    const ticket = ticketIndex.get(entry.qrCode);
    if (entry.status === 'SYNCED' && (
      serverCodes.has(entry.qrCode) || (ticket && serverTicketIds.has(ticket.ticketId))
    )) continue;
    entries.push({
      id: `device:${entry.localId}`,
      referenceCode: ticket?.referenceCode,
      ticketTypeName: ticket?.ticketTypeName,
      qrCode: entry.qrCode,
      gate: entry.gate,
      checkedAt: entry.checkedAt,
      status: localAdmissionStatus[entry.status],
      source: 'device',
    });
  }

  return entries.sort((a, b) => Date.parse(b.checkedAt) - Date.parse(a.checkedAt));
}

export type HistoryFilter = 'all' | 'confirmed' | 'pending' | 'error';

export function filterHistory(entries: HistoryEntry[], filter: HistoryFilter, query: string) {
  const phrase = query.trim().toLowerCase();
  return entries.filter((entry) => {
    const status = entry.status;
    const matchesStatus = filter === 'all' || status === filter ||
      (filter === 'error' && (status === 'conflict' || status === 'failed'));
    return matchesStatus && (!phrase || [entry.referenceCode, entry.qrCode].some(
      (code) => code?.toLowerCase().includes(phrase),
    ));
  });
}
