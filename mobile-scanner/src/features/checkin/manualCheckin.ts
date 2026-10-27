import {
  scanTicketOnline,
} from '../../api';
import {
  countLogsByStatus,
  getLocalCheckinLogByQrCode,
  getTicketByQrCode,
  insertLocalCheckinLog,
} from '../../database';
import type { LogStatusCounts } from '../../database';

export type ManualCheckinResult = {
  status: 'PENDING' | 'INVALID_LOCAL' | 'DUPLICATE_LOCAL' | 'ONLINE_ACCEPTED' | 'ONLINE_FAILED';
  message: string;
  checkedAt?: string;
  qrCode: string;
};

export type ManualCheckinOutcome = {
  result: ManualCheckinResult;
  inserted: boolean;
};

type ManualOfflineCheckinInput = {
  concertId: string;
  qrCode: string;
  gate: string;
};

type OnlineCheckinInput = ManualOfflineCheckinInput & {
  deviceId: string;
  accessToken?: string;
};

export const EMPTY_LOG_COUNTERS: LogStatusCounts = {
  PENDING: 0,
  SYNCED: 0,
  CONFLICT: 0,
  FAILED: 0,
};

export async function performManualOfflineCheckin({
  concertId,
  qrCode,
  gate,
}: ManualOfflineCheckinInput): Promise<ManualCheckinOutcome> {
  const selectedConcertId = concertId.trim();
  const selectedQrCode = qrCode.trim();
  const selectedGate = gate.trim();

  if (!selectedConcertId) {
    return invalidResult('Chọn concert trước khi check-in.', selectedQrCode);
  }

  if (!selectedQrCode) {
    return invalidResult('Nhập hoặc quét mã QR trước khi check-in.', selectedQrCode);
  }

  const ticket = await getTicketByQrCode(selectedConcertId, selectedQrCode);

  if (!ticket) {
    return invalidResult('Không tìm thấy mã QR trong dataset local.', selectedQrCode);
  }

  const duplicate = await getLocalCheckinLogByQrCode(selectedConcertId, selectedQrCode);

  if (duplicate) {
    return {
      inserted: false,
      result: {
        status: 'DUPLICATE_LOCAL',
        message: `Mã QR này đã có lượt check-in local với trạng thái ${duplicate.status}.`,
        checkedAt: duplicate.checkedAt,
        qrCode: selectedQrCode,
      },
    };
  }

  const checkedAt = new Date().toISOString();
  await insertLocalCheckinLog({
    concertId: selectedConcertId,
    qrCode: selectedQrCode,
    checkedAt,
    gate: selectedGate || null,
    status: 'PENDING',
  });

  return {
    inserted: true,
    result: {
      status: 'PENDING',
      message: 'Vé hợp lệ. Lượt check-in đã được lưu và chờ đồng bộ.',
      checkedAt,
      qrCode: selectedQrCode,
    },
  };
}

export async function performOnlineCheckin({
  concertId,
  qrCode,
  gate,
  deviceId,
  accessToken,
}: OnlineCheckinInput): Promise<ManualCheckinOutcome> {
  const selectedConcertId = concertId.trim();
  const selectedQrCode = qrCode.trim();
  const selectedDeviceId = deviceId.trim();

  if (!selectedConcertId) {
    return invalidResult('Chọn concert trước khi check-in.', selectedQrCode);
  }

  if (!selectedQrCode) {
    return invalidResult('Nhập hoặc quét mã QR trước khi check-in.', selectedQrCode);
  }

  if (!selectedDeviceId) {
    return invalidResult('Thiết bị chưa có mã định danh để check-in online.', selectedQrCode);
  }

  const response = await scanTicketOnline(
    {
      qrCode: selectedQrCode,
      concertId: selectedConcertId,
      deviceId: selectedDeviceId,
      gate: gate.trim() || null,
    },
    accessToken,
  );

  const accepted = response.status === 'SUCCESS';

  if (accepted) {
    await insertLocalCheckinLog({
      concertId: selectedConcertId,
      qrCode: selectedQrCode,
      checkedAt: response.checkAt,
      gate: gate.trim() || null,
      status: 'SYNCED',
    });
  }

  return {
    inserted: accepted,
    result: {
      status: accepted ? 'ONLINE_ACCEPTED' : 'ONLINE_FAILED',
      message: response.message,
      checkedAt: response.checkAt,
      qrCode: selectedQrCode,
    },
  };
}

export function loadCheckinCounters(concertId: string) {
  const selectedConcertId = concertId.trim();

  if (!selectedConcertId) {
    return Promise.resolve(EMPTY_LOG_COUNTERS);
  }

  return countLogsByStatus(selectedConcertId);
}

function invalidResult(message: string, qrCode: string): ManualCheckinOutcome {
  return {
    inserted: false,
    result: {
      status: 'INVALID_LOCAL',
      message,
      qrCode,
    },
  };
}
