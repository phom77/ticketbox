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

const DATABASE_NAME = 'ticketbox-scanner.db';

let databasePromise: Promise<SQLiteDatabase> | null = null;

export async function initDatabase() {
  const db = await getDatabase();

  await db.execAsync(`
    PRAGMA journal_mode = WAL;

    CREATE TABLE IF NOT EXISTS ticket_snapshots (
      concert_id TEXT NOT NULL,
      ticket_id TEXT NOT NULL,
      qr_code TEXT NOT NULL,
      qr_secret TEXT NOT NULL,
      ticket_type_id TEXT NOT NULL,
      user_id TEXT NOT NULL,
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

  return db;
}

export async function cacheStaffConcerts(concerts: Omit<LocalConcert, 'cachedAt'>[]) {
  const db = await initDatabase();
  const cachedAt = nowIso();

  await db.withTransactionAsync(async () => {
    for (const concert of concerts) {
      await db.runAsync(
        `INSERT INTO local_concerts (
          id, title, venue_name, venue_address, event_date, doors_open_at,
          status, poster_url, cached_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          venue_name = excluded.venue_name,
          venue_address = excluded.venue_address,
          event_date = excluded.event_date,
          doors_open_at = excluded.doors_open_at,
          status = excluded.status,
          poster_url = excluded.poster_url,
          cached_at = excluded.cached_at`,
        concert.id,
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

export async function listCachedConcerts() {
  const db = await initDatabase();
  return db.getAllAsync<LocalConcertRow>(
    `SELECT
      id,
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

export async function saveCheckinDataset(dataset: SaveDatasetInput, downloadedAt = nowIso()) {
  const db = await initDatabase();

  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM ticket_snapshots WHERE concert_id = ?', dataset.concertId);

    for (const ticket of dataset.tickets) {
      await db.runAsync(
        `INSERT INTO ticket_snapshots (
          concert_id,
          ticket_id,
          qr_code,
          qr_secret,
          ticket_type_id,
          user_id,
          downloaded_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        dataset.concertId,
        ticket.ticketId,
        ticket.qrCode,
        ticket.qrSecret,
        ticket.ticketTypeId,
        ticket.userId,
        downloadedAt,
      );
    }
  });

  await setMetadata(`dataset:${dataset.concertId}:downloadedAt`, downloadedAt);
  await setMetadata(`dataset:${dataset.concertId}:totalCount`, String(dataset.totalCount));
}

export async function getTicketByQrCode(concertId: string, qrCode: string) {
  const db = await initDatabase();

  return db.getFirstAsync<TicketSnapshotRow>(
    `SELECT
      concert_id AS concertId,
      ticket_id AS ticketId,
      qr_code AS qrCode,
      qr_secret AS qrSecret,
      ticket_type_id AS ticketTypeId,
      user_id AS userId,
      downloaded_at AS downloadedAt
    FROM ticket_snapshots
    WHERE concert_id = ? AND qr_code = ?
    LIMIT 1`,
    concertId,
    qrCode,
  );
}

export async function listLocalTickets(concertId: string) {
  const db = await initDatabase();
  return db.getAllAsync<LocalTicketListItemRow>(
    `SELECT
      ticket.concert_id AS concertId,
      ticket.ticket_id AS ticketId,
      ticket.qr_code AS qrCode,
      ticket.qr_secret AS qrSecret,
      ticket.ticket_type_id AS ticketTypeId,
      ticket.user_id AS userId,
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

export async function insertLocalCheckinLog(input: InsertLocalCheckinLogInput) {
  const db = await initDatabase();
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

export async function getLocalCheckinLogByQrCode(concertId: string, qrCode: string) {
  const db = await initDatabase();

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

export async function listPendingLogs(concertId: string, limit = 500) {
  const db = await initDatabase();

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

export async function listLocalCheckinLogs(concertId: string, limit = 200) {
  const db = await initDatabase();
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

export async function getDatasetInfo(concertId: string): Promise<DatasetInfo> {
  const [downloadedAt, rawTotalCount] = await Promise.all([
    getMetadata(`dataset:${concertId}:downloadedAt`),
    getMetadata(`dataset:${concertId}:totalCount`),
  ]);

  return {
    downloadedAt,
    totalCount: Number(rawTotalCount ?? 0),
  };
}

export async function updateSyncResult(input: UpdateSyncResultInput) {
  const db = await initDatabase();

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

export async function countLogsByStatus(concertId?: string) {
  const db = await initDatabase();
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

export async function setMetadata(key: string, value: string) {
  const db = await getDatabase();

  await db.runAsync(
    `INSERT INTO app_metadata (key, value)
    VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

export async function getMetadata(key: string) {
  const db = await initDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_metadata WHERE key = ? LIMIT 1',
    key,
  );

  return row?.value ?? null;
}

async function getDatabase() {
  databasePromise ??= openDatabaseAsync(DATABASE_NAME);
  return databasePromise;
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
