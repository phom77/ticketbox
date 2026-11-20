import { MAX_SYNC_BATCH_SIZE, syncCheckinLogs, type StaffScope } from '../../api';
import { listPendingLogs, updateSyncResult } from '../../database';
import type { LocalCheckinStatus } from '../../database';

export type PendingSyncSummary = {
  total: number;
  accepted: number;
  skipped: number;
  invalid: number;
};

type SyncPendingLogsInput = StaffScope & {
  accountId: string;
  concertId: string;
  deviceId: string;
};

export async function syncPendingLogs({
  accountId,
  concertId,
  deviceId,
  organizationId,
  token,
}: SyncPendingLogsInput): Promise<PendingSyncSummary> {
  const selectedConcertId = concertId.trim();
  const selectedDeviceId = deviceId.trim();

  if (!selectedConcertId) {
    throw new Error('Missing event ID for sync');
  }

  if (!selectedDeviceId) {
    throw new Error('Missing device ID for sync');
  }

  const pendingLogs = await listPendingLogs(accountId, selectedConcertId, MAX_SYNC_BATCH_SIZE);

  if (pendingLogs.length === 0) {
    return {
      total: 0,
      accepted: 0,
      skipped: 0,
      invalid: 0,
    };
  }

  const response = await syncCheckinLogs(
    {
      concertId: selectedConcertId,
      deviceId: selectedDeviceId,
      logs: pendingLogs.map((log) => ({
        qrCode: log.qrCode,
        checkedAt: log.checkedAt,
        gate: log.gate,
        notes: log.notes,
      })),
    },
    { organizationId, token },
  );

  for (const result of response.results) {
    const localLog = pendingLogs.find((log) => log.qrCode === result.qrCode);

    if (!localLog) {
      continue;
    }

    await updateSyncResult(accountId, {
      localId: localLog.localId,
      status: toLocalStatus(result.result),
      syncResult: result.result,
      syncReason: result.reason,
    });
  }

  return {
    total: response.total,
    accepted: response.accepted,
    skipped: response.skipped,
    invalid: response.invalid,
  };
}

function toLocalStatus(result: string): LocalCheckinStatus {
  if (result === 'ACCEPTED') {
    return 'SYNCED';
  }

  if (result === 'SKIPPED') {
    return 'CONFLICT';
  }

  return 'FAILED';
}
