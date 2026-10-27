import type {
  DatasetInfo,
  InsertLocalCheckinLogInput,
  LocalCheckinLog,
  LocalConcert,
  LocalTicketListItem,
  LogStatusCounts,
  SaveDatasetInput,
  TicketSnapshot,
  UpdateSyncResultInput,
} from './types';

type WebScannerStore = {
  concerts: Map<string, LocalConcert>;
  tickets: Map<string, TicketSnapshot>;
  logs: LocalCheckinLog[];
  metadata: Map<string, string>;
};

const store: WebScannerStore = {
  concerts: new Map(),
  tickets: new Map(),
  logs: [],
  metadata: new Map(),
};

export async function initDatabase() {
  return store;
}

export async function cacheStaffConcerts(concerts: Omit<LocalConcert, 'cachedAt'>[]) {
  const cachedAt = nowIso();
  concerts.forEach((concert) => {
    store.concerts.set(concert.id, { ...concert, cachedAt });
  });
}

export async function listCachedConcerts() {
  return Array.from(store.concerts.values()).sort((left, right) =>
    left.eventDate.localeCompare(right.eventDate),
  );
}

export async function saveCheckinDataset(dataset: SaveDatasetInput, downloadedAt = nowIso()) {
  for (const key of Array.from(store.tickets.keys())) {
    if (key.startsWith(`${dataset.concertId}:`)) {
      store.tickets.delete(key);
    }
  }

  dataset.tickets.forEach((ticket) => {
    const snapshot: TicketSnapshot = {
      concertId: dataset.concertId,
      ticketId: ticket.ticketId,
      qrCode: ticket.qrCode,
      qrSecret: ticket.qrSecret,
      ticketTypeId: ticket.ticketTypeId,
      userId: ticket.userId,
      downloadedAt,
    };
    store.tickets.set(ticketKey(snapshot.concertId, snapshot.ticketId), snapshot);
  });

  await setMetadata(`dataset:${dataset.concertId}:downloadedAt`, downloadedAt);
  await setMetadata(`dataset:${dataset.concertId}:totalCount`, String(dataset.totalCount));
}

export async function getTicketByQrCode(concertId: string, qrCode: string) {
  return Array.from(store.tickets.values()).find(
    (ticket) => ticket.concertId === concertId && ticket.qrCode === qrCode,
  ) ?? null;
}

export async function listLocalTickets(concertId: string) {
  return Array.from(store.tickets.values())
    .filter((ticket) => ticket.concertId === concertId)
    .sort((left, right) => left.ticketId.localeCompare(right.ticketId))
    .map<LocalTicketListItem>((ticket) => {
      const latestLog = latestLogForQr(ticket.concertId, ticket.qrCode);
      return {
        ...ticket,
        checkinStatus: latestLog?.status ?? null,
        checkedAt: latestLog?.checkedAt ?? null,
      };
    });
}

export async function insertLocalCheckinLog(input: InsertLocalCheckinLogInput) {
  const log: LocalCheckinLog = {
    localId: createLocalId(),
    concertId: input.concertId,
    qrCode: input.qrCode,
    checkedAt: input.checkedAt,
    gate: input.gate ?? null,
    notes: input.notes ?? null,
    status: input.status ?? 'PENDING',
    syncResult: null,
    syncReason: null,
  };
  store.logs.push(log);
  return log;
}

export async function getLocalCheckinLogByQrCode(concertId: string, qrCode: string) {
  return store.logs
    .filter(
      (log) =>
        log.concertId === concertId &&
        log.qrCode === qrCode &&
        ['PENDING', 'SYNCED', 'CONFLICT'].includes(log.status),
    )
    .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))[0] ?? null;
}

export async function listPendingLogs(concertId: string, limit = 500) {
  return store.logs
    .filter((log) => log.concertId === concertId && log.status === 'PENDING')
    .sort((left, right) => left.checkedAt.localeCompare(right.checkedAt))
    .slice(0, limit);
}

export async function listLocalCheckinLogs(concertId: string, limit = 200) {
  return store.logs
    .filter((log) => log.concertId === concertId)
    .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))
    .slice(0, limit);
}

export async function getDatasetInfo(concertId: string): Promise<DatasetInfo> {
  const downloadedAt = await getMetadata(`dataset:${concertId}:downloadedAt`);
  const totalCount = Number((await getMetadata(`dataset:${concertId}:totalCount`)) ?? 0);
  return { downloadedAt, totalCount };
}

export async function updateSyncResult(input: UpdateSyncResultInput) {
  const log = store.logs.find((item) => item.localId === input.localId);
  if (!log) return;
  log.status = input.status;
  log.syncResult = input.syncResult;
  log.syncReason = input.syncReason ?? null;
}

export async function countLogsByStatus(concertId?: string) {
  const counts = createEmptyStatusCounts();
  store.logs
    .filter((log) => concertId === undefined || log.concertId === concertId)
    .forEach((log) => {
      counts[log.status] += 1;
    });
  return counts;
}

export async function setMetadata(key: string, value: string) {
  store.metadata.set(key, value);
}

export async function getMetadata(key: string) {
  return store.metadata.get(key) ?? null;
}

function latestLogForQr(concertId: string, qrCode: string) {
  return store.logs
    .filter((log) => log.concertId === concertId && log.qrCode === qrCode)
    .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))[0];
}

function ticketKey(concertId: string, ticketId: string) {
  return `${concertId}:${ticketId}`;
}

function nowIso() {
  return new Date().toISOString();
}

function createLocalId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function createEmptyStatusCounts(): LogStatusCounts {
  return {
    PENDING: 0,
    SYNCED: 0,
    CONFLICT: 0,
    FAILED: 0,
  };
}
