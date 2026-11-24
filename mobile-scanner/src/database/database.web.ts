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

const stores = new Map<string, WebScannerStore>();

function getStore(accountId: string) {
  const existing = stores.get(accountId);
  if (existing) return existing;
  const store: WebScannerStore = { concerts: new Map(), tickets: new Map(), logs: [], metadata: new Map() };
  stores.set(accountId, store);
  return store;
}

export async function initDatabase(accountId: string) {
  return getStore(accountId);
}

export async function cacheStaffConcerts(accountId: string, concerts: Omit<LocalConcert, 'cachedAt'>[]) {
  const store = getStore(accountId);
  store.concerts.clear();
  const cachedAt = nowIso();
  concerts.forEach((concert) => {
    store.concerts.set(concert.id, { ...concert, cachedAt });
  });
}

export async function listCachedConcerts(accountId: string) {
  return Array.from(getStore(accountId).concerts.values()).sort((left, right) =>
    left.eventDate.localeCompare(right.eventDate),
  );
}

export async function saveCheckinDataset(accountId: string, dataset: SaveDatasetInput, downloadedAt = nowIso()) {
  const store = getStore(accountId);
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
      ticketTypeId: ticket.ticketTypeId,
      referenceCode: ticket.referenceCode ?? null,
      ticketTypeName: ticket.ticketTypeName ?? null,
      downloadedAt,
    };
    store.tickets.set(ticketKey(snapshot.concertId, snapshot.ticketId), snapshot);
  });

  await setMetadata(accountId, `dataset:${dataset.concertId}:downloadedAt`, downloadedAt);
  await setMetadata(accountId, `dataset:${dataset.concertId}:totalCount`, String(dataset.totalCount));
}

export async function getTicketByQrCode(accountId: string, concertId: string, qrCode: string) {
  return Array.from(getStore(accountId).tickets.values()).find(
    (ticket) => ticket.concertId === concertId && ticket.qrCode === qrCode,
  ) ?? null;
}

export async function listLocalTickets(accountId: string, concertId: string) {
  return Array.from(getStore(accountId).tickets.values())
    .filter((ticket) => ticket.concertId === concertId)
    .sort((left, right) => left.ticketId.localeCompare(right.ticketId))
    .map<LocalTicketListItem>((ticket) => {
      const latestLog = latestLogForQr(accountId, ticket.concertId, ticket.qrCode);
      return {
        ...ticket,
        checkinStatus: latestLog?.status ?? null,
        checkedAt: latestLog?.checkedAt ?? null,
      };
    });
}

export async function insertLocalCheckinLog(accountId: string, input: InsertLocalCheckinLogInput) {
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
  getStore(accountId).logs.push(log);
  return log;
}

export async function getLocalCheckinLogByQrCode(accountId: string, concertId: string, qrCode: string) {
  return getStore(accountId).logs
    .filter(
      (log) =>
        log.concertId === concertId &&
        log.qrCode === qrCode &&
        ['PENDING', 'SYNCED', 'CONFLICT'].includes(log.status),
    )
    .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))[0] ?? null;
}

export async function listPendingLogs(accountId: string, concertId: string, limit = 500) {
  return getStore(accountId).logs
    .filter((log) => log.concertId === concertId && log.status === 'PENDING')
    .sort((left, right) => left.checkedAt.localeCompare(right.checkedAt))
    .slice(0, limit);
}

export async function listLocalCheckinLogs(accountId: string, concertId: string, limit = 200) {
  return getStore(accountId).logs
    .filter((log) => log.concertId === concertId)
    .sort((left, right) => right.checkedAt.localeCompare(left.checkedAt))
    .slice(0, limit);
}

export async function getDatasetInfo(accountId: string, concertId: string): Promise<DatasetInfo> {
  const downloadedAt = await getMetadata(accountId, `dataset:${concertId}:downloadedAt`);
  const totalCount = Number((await getMetadata(accountId, `dataset:${concertId}:totalCount`)) ?? 0);
  return { downloadedAt, totalCount };
}

export async function updateSyncResult(accountId: string, input: UpdateSyncResultInput) {
  const log = getStore(accountId).logs.find((item) => item.localId === input.localId);
  if (!log) return;
  log.status = input.status;
  log.syncResult = input.syncResult;
  log.syncReason = input.syncReason ?? null;
}

export async function countLogsByStatus(accountId: string, concertId?: string) {
  const counts = createEmptyStatusCounts();
  getStore(accountId).logs
    .filter((log) => concertId === undefined || log.concertId === concertId)
    .forEach((log) => {
      counts[log.status] += 1;
    });
  return counts;
}

export async function setMetadata(accountId: string, key: string, value: string) {
  getStore(accountId).metadata.set(key, value);
}

export async function getMetadata(accountId: string, key: string) {
  return getStore(accountId).metadata.get(key) ?? null;
}

function latestLogForQr(accountId: string, concertId: string, qrCode: string) {
  return getStore(accountId).logs
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
