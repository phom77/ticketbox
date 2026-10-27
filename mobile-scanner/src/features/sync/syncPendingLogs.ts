import { MAX_SYNC_BATCH_SIZE, syncCheckinLogs } from '../../api';
import { listPendingLogs, updateSyncResult } from '../../database';
import type { LocalCheckinStatus } from '../../database';

export type PendingSyncSummary = {
  total: number;
  accepted: number;
  skipped: number;
  invalid: number;
};

type SyncPendingLogsInput = {
  concertId: string;
  deviceId: string;
  accessToken?: string;
};

export async function syncPendingLogs({
  concertId,
  deviceId,
  accessToken,
}: SyncPendingLogsInput): Promise<PendingSyncSummary> {
  const selectedConcertId = concertId.trim();
  const selectedDeviceId = deviceId.trim();

  if (!selectedConcertId) {
    throw new Error('Chọn concert trước khi đồng bộ.');
  }

  if (!selectedDeviceId) {
    throw new Error('Thiết bị chưa có mã định danh để đồng bộ.');
  }

  const pendingLogs = await listPendingLogs(selectedConcertId, MAX_SYNC_BATCH_SIZE);

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
    accessToken,
  );

  for (const result of response.results) {
    const localLog = pendingLogs.find((log) => log.qrCode === result.qrCode);

    if (!localLog) {
      continue;
    }

    await updateSyncResult({
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
