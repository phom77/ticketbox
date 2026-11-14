import type { ServerCheckinHistory } from '../../api';
import type { LocalCheckinLog, LocalTicketListItem } from '../../database';
import { localAdmissionStatus } from './status';

export type HistoryEntry = {
  id: string;
  ticketId?: string;
  qrCode?: string;
  gate: string | null;
  checkedAt: string;
  status: 'confirmed' | 'pending' | 'conflict' | 'failed';
  reason?: string;
  source: 'device' | 'server';
};

export function mergeHistory(
  local: LocalCheckinLog[],
  server: ServerCheckinHistory[],
  tickets: Pick<LocalTicketListItem, 'qrCode' | 'ticketId'>[],
): HistoryEntry[] {
  const ticketIds = new Map(tickets.map((item) => [item.qrCode, item.ticketId]));
  const serverTicketIds = new Set(server.map((entry) => entry.ticketId));
  const serverCodes = new Set(server.map((entry) => entry.qrCode));
  const entries: HistoryEntry[] = server.map((entry) => ({
    id: `server:${entry.id}`,
    ticketId: entry.ticketId,
    qrCode: entry.qrCode ?? undefined,
    gate: entry.gate,
    checkedAt: entry.checkedAt,
    status: 'confirmed',
    source: 'server',
  }));

  for (const entry of local) {
    const ticketId = ticketIds.get(entry.qrCode);
    if (entry.status === 'SYNCED' && (
      serverCodes.has(entry.qrCode) || (ticketId && serverTicketIds.has(ticketId))
    )) continue;
    entries.push({
      id: `device:${entry.localId}`,
      ticketId,
      qrCode: entry.qrCode,
      gate: entry.gate,
      checkedAt: entry.checkedAt,
      status: localAdmissionStatus[entry.status],
      reason: entry.syncReason ?? undefined,
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
    return matchesStatus && (!phrase || [entry.ticketId, entry.qrCode].some(
      (code) => code?.toLowerCase().includes(phrase),
    ));
  });
}
