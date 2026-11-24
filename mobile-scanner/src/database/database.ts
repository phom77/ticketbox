import { openDatabaseAsync, type SQLiteDatabase } from 'expo-sqlite';

import type {
  InsertLocalCheckinLogInput,
  DatasetInfo,
  LocalConcert,
  LocalCheckinLog,
  LocalCheckinStatus,
  LogStatusCounts,
  SaveDatasetInput,
  TicketSnapshot,
  LocalTicketListItem,
  UpdateSyncResultInput,
} from './types';

const databases = new Map<string, Promise<SQLiteDatabase>>();

export function initDatabase(accountId: string) {
  const cached = databases.get(accountId);
  if (cached) return cached;
  if (!/^[a-z0-9-]{1,80}$/i.test(accountId)) throw new Error('Invalid scanner account ID');
  const database = openDatabaseAsync(`ticketbox-scanner-${accountId}.db`)
    .then(initializeDatabase)
    .catch((error) => {
      databases.delete(accountId);
      throw error;
    });
  databases.set(accountId, database);
  return database;
}

async function initializeDatabase(db: SQLiteDatabase) {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS ticket_snapshots (
      concert_id TEXT NOT NULL,
      ticket_id TEXT NOT NULL,
      qr_code TEXT NOT NULL,
      ticket_type_id TEXT NOT NULL,
      reference_code TEXT,
      ticket_type_name TEXT,
      downloaded_at TEXT NOT NULL,
      PRIMARY KEY (concert_id, ticket_id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_ticket_snapshots_concert_qr
      ON ticket_snapshots(concert_id, qr_code);

    CREATE TABLE IF NOT EXISTS local_checkin_logs (
      local_id TEXT PRIMARY KEY,
      concert_id TEXT NOT NULL,
      qr_code TEXT NOT NULL,
      checked_at TEXT NOT NULL,
      gate TEXT,
      notes TEXT,
      status TEXT NOT NULL,
      sync_result TEXT,
      sync_reason TEXT
    );

    CREATE INDEX IF NOT EXISTS idx_local_checkin_logs_concert_status
      ON local_checkin_logs(concert_id, status);

    CREATE INDEX IF NOT EXISTS idx_local_checkin_logs_concert_qr
      ON local_checkin_logs(concert_id, qr_code);

    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS local_concerts (
      id TEXT PRIMARY KEY,
      organization_id TEXT NOT NULL,
      title TEXT NOT NULL,
      venue_name TEXT NOT NULL,
      venue_address TEXT NOT NULL,
      event_date TEXT NOT NULL,
      doors_open_at TEXT,
      status TEXT NOT NULL,
      poster_url TEXT,
      cached_at TEXT NOT NULL
    );
  `);

  const ticketColumns = await db.getAllAsync<{ name: string }>('PRAGMA table_info(ticket_snapshots)');
  if (!ticketColumns.some(({ name }) => name === 'reference_code')) {
    await db.execAsync('ALTER TABLE ticket_snapshots ADD COLUMN reference_code TEXT');
  }
  if (!ticketColumns.some(({ name }) => name === 'ticket_type_name')) {
    await db.execAsync('ALTER TABLE ticket_snapshots ADD COLUMN ticket_type_name TEXT');
  }

  return db;
}

export async function cacheStaffConcerts(accountId: string, concerts: Omit<LocalConcert, 'cachedAt'>[]) {
  const db = await initDatabase(accountId);
  const cachedAt = nowIso();

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM local_concerts');
    for (const concert of concerts) {
      await db.runAsync(
        `INSERT INTO local_concerts (
          id, organization_id, title, venue_name, venue_address, event_date, doors_open_at,
          status, poster_url, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          organization_id = excluded.organization_id,
          title = excluded.title,
          venue_name = excluded.venue_name,
          venue_address = excluded.venue_address,
          event_date = excluded.event_date,
          doors_open_at = excluded.doors_open_at,
          status = excluded.status,
          poster_url = excluded.poster_url,
          cached_at = excluded.cached_at`,
        concert.id,
        concert.organizationId,
        concert.title,
        concert.venueName,
        concert.venueAddress,
        concert.eventDate,
        concert.doorsOpenAt,
        concert.status,
        concert.posterUrl,
        cachedAt,
      );
    }
  });
}

export async function listCachedConcerts(accountId: string) {
  const db = await initDatabase(accountId);
  return db.getAllAsync<LocalConcertRow>(
    `SELECT
      id,
      organization_id AS organizationId,
      title,
      venue_name AS venueName,
      venue_address AS venueAddress,
      event_date AS eventDate,
      doors_open_at AS doorsOpenAt,
      status,
      poster_url AS posterUrl,
      cached_at AS cachedAt
    FROM local_concerts
    ORDER BY event_date ASC`,
  );
}

export async function saveCheckinDataset(accountId: string, dataset: SaveDatasetInput, downloadedAt = nowIso()) {
  const db = await initDatabase(accountId);

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM ticket_snapshots WHERE concert_id = ?', dataset.concertId);

    for (const ticket of dataset.tickets) {
      await db.runAsync(
        `INSERT INTO ticket_snapshots (
          concert_id,
          ticket_id,
          qr_code,
          ticket_type_id,
          reference_code,
          ticket_type_name,
          downloaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        dataset.concertId,
        ticket.ticketId,
        ticket.qrCode,
        ticket.ticketTypeId,
        ticket.referenceCode ?? null,
        ticket.ticketTypeName ?? null,
        downloadedAt,
      );
    }
  });

  await setMetadata(accountId, `dataset:${dataset.concertId}:downloadedAt`, downloadedAt);
  await setMetadata(accountId, `dataset:${dataset.concertId}:totalCount`, String(dataset.totalCount));
}

export async function getTicketByQrCode(accountId: string, concertId: string, qrCode: string) {
  const db = await initDatabase(accountId);

  return db.getFirstAsync<TicketSnapshotRow>(
    `SELECT
      concert_id AS concertId,
      ticket_id AS ticketId,
      qr_code AS qrCode,
      ticket_type_id AS ticketTypeId,
      reference_code AS referenceCode,
      ticket_type_name AS ticketTypeName,
      downloaded_at AS downloadedAt
    FROM ticket_snapshots
    WHERE concert_id = ? AND qr_code = ?
    LIMIT 1`,
    concertId,
    qrCode,
  );
}

export async function listLocalTickets(accountId: string, concertId: string) {
  const db = await initDatabase(accountId);
  return db.getAllAsync<LocalTicketListItemRow>(
    `SELECT
      ticket.concert_id AS concertId,
      ticket.ticket_id AS ticketId,
      ticket.qr_code AS qrCode,
      ticket.ticket_type_id AS ticketTypeId,
      ticket.reference_code AS referenceCode,
      ticket.ticket_type_name AS ticketTypeName,
      ticket.downloaded_at AS downloadedAt,
      log.status AS checkinStatus,
      log.checked_at AS checkedAt
    FROM ticket_snapshots ticket
    LEFT JOIN local_checkin_logs log
      ON log.local_id = (
        SELECT latest.local_id
        FROM local_checkin_logs latest
        WHERE latest.concert_id = ticket.concert_id
          AND latest.qr_code = ticket.qr_code
        ORDER BY latest.checked_at DESC
        LIMIT 1
      )
    WHERE ticket.concert_id = ?
    ORDER BY ticket.ticket_id ASC`,
    concertId,
  );
}

export async function insertLocalCheckinLog(accountId: string, input: InsertLocalCheckinLogInput) {
  const db = await initDatabase(accountId);
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

  await db.runAsync(
    `INSERT INTO local_checkin_logs (
      local_id,
      concert_id,
      qr_code,
      checked_at,
      gate,
      notes,
      status,
      sync_result,
      sync_reason
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    log.localId,
    log.concertId,
    log.qrCode,
    log.checkedAt,
    log.gate,
    log.notes,
    log.status,
    log.syncResult,
    log.syncReason,
  );

  return log;
}

export async function getLocalCheckinLogByQrCode(accountId: string, concertId: string, qrCode: string) {
  const db = await initDatabase(accountId);

  return db.getFirstAsync<LocalCheckinLogRow>(
    `SELECT
      local_id AS localId,
      concert_id AS concertId,
      qr_code AS qrCode,
      checked_at AS checkedAt,
      gate,
      notes,
      status,
      sync_result AS syncResult,
      sync_reason AS syncReason
    FROM local_checkin_logs
    WHERE concert_id = ?
      AND qr_code = ?
      AND status IN ('PENDING', 'SYNCED', 'CONFLICT')
    ORDER BY checked_at DESC
    LIMIT 1`,
    concertId,
    qrCode,
  );
}

export async function listPendingLogs(accountId: string, concertId: string, limit = 500) {
  const db = await initDatabase(accountId);

  return db.getAllAsync<LocalCheckinLogRow>(
    `SELECT
      local_id AS localId,
      concert_id AS concertId,
      qr_code AS qrCode,
      checked_at AS checkedAt,
      gate,
      notes,
      status,
      sync_result AS syncResult,
      sync_reason AS syncReason
    FROM local_checkin_logs
    WHERE concert_id = ? AND status = 'PENDING'
    ORDER BY checked_at ASC
    LIMIT ?`,
    concertId,
    limit,
  );
}

export async function listLocalCheckinLogs(accountId: string, concertId: string, limit = 200) {
  const db = await initDatabase(accountId);
  return db.getAllAsync<LocalCheckinLogRow>(
    `SELECT
      local_id AS localId,
      concert_id AS concertId,
      qr_code AS qrCode,
      checked_at AS checkedAt,
      gate,
      notes,
      status,
      sync_result AS syncResult,
      sync_reason AS syncReason
    FROM local_checkin_logs
    WHERE concert_id = ?
    ORDER BY checked_at DESC
    LIMIT ?`,
    concertId,
    limit,
  );
}

export async function getDatasetInfo(accountId: string, concertId: string): Promise<DatasetInfo> {
  const [downloadedAt, rawTotalCount] = await Promise.all([
    getMetadata(accountId, `dataset:${concertId}:downloadedAt`),
    getMetadata(accountId, `dataset:${concertId}:totalCount`),
  ]);

  return {
    downloadedAt,
    totalCount: Number(rawTotalCount ?? 0),
  };
}

export async function updateSyncResult(accountId: string, input: UpdateSyncResultInput) {
  const db = await initDatabase(accountId);

  await db.runAsync(
    `UPDATE local_checkin_logs
    SET status = ?, sync_result = ?, sync_reason = ?
    WHERE local_id = ?`,
    input.status,
    input.syncResult,
    input.syncReason ?? null,
    input.localId,
  );
}

export async function countLogsByStatus(accountId: string, concertId?: string) {
  const db = await initDatabase(accountId);
  const counts = createEmptyStatusCounts();
  const rows =
    concertId === undefined
      ? await db.getAllAsync<StatusCountRow>(
          `SELECT status, COUNT(*) AS count
          FROM local_checkin_logs
          GROUP BY status`,
        )
      : await db.getAllAsync<StatusCountRow>(
          `SELECT status, COUNT(*) AS count
          FROM local_checkin_logs
          WHERE concert_id = ?
          GROUP BY status`,
          concertId,
        );

  for (const row of rows) {
    if (isLocalCheckinStatus(row.status)) {
      counts[row.status] = row.count;
    }
  }

  return counts;
}

export async function setMetadata(accountId: string, key: string, value: string) {
  const db = await initDatabase(accountId);

  await db.runAsync(
    `INSERT INTO app_metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function getMetadata(accountId: string, key: string) {
  const db = await initDatabase(accountId);
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_metadata WHERE key = ? LIMIT 1',
    key,
  );

  return row?.value ?? null;
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

function isLocalCheckinStatus(status: string): status is LocalCheckinStatus {
  return status === 'PENDING' || status === 'SYNCED' || status === 'CONFLICT' || status === 'FAILED';
}

type TicketSnapshotRow = TicketSnapshot;
type LocalCheckinLogRow = LocalCheckinLog;
type LocalConcertRow = LocalConcert;
type LocalTicketListItemRow = LocalTicketListItem;

type StatusCountRow = {
  status: string;
  count: number;
};
