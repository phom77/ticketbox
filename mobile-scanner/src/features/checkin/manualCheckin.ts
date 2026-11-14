import {
  ApiClientError,
  scanTicketOnline,
} from '../../api';
import {
  countLogsByStatus,
  getLocalCheckinLogByQrCode,
  getTicketByQrCode,
  insertLocalCheckinLog,
} from '../../database';
import type { LocalCheckinStatus, LogStatusCounts } from '../../database';
import type { MessageKey } from '../../i18n';

export type ManualCheckinResult = {
  status:
    | 'PENDING' | 'INVALID_LOCAL' | 'DUPLICATE_LOCAL' | 'ONLINE_ACCEPTED' | 'ONLINE_FAILED'
    | 'UNAUTHENTICATED' | 'FORBIDDEN' | 'ERROR';
  message: MessageKey;
  previousStatus?: LocalCheckinStatus;
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
    return invalidResult('selectEventForScan', selectedQrCode);
  }

  if (!selectedQrCode) {
    return invalidResult('codeRequired', selectedQrCode);
  }

  const ticket = await getTicketByQrCode(selectedConcertId, selectedQrCode);

  if (!ticket) {
    return invalidResult('missingCodeHint', selectedQrCode);
  }

  const duplicate = await getLocalCheckinLogByQrCode(selectedConcertId, selectedQrCode);

  if (duplicate) {
    return {
      inserted: false,
      result: {
        status: 'DUPLICATE_LOCAL',
        message: 'previousScan',
        previousStatus: duplicate.status,
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
      message: 'pendingHint',
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
    return invalidResult('selectEventForScan', selectedQrCode);
  }

  if (!selectedQrCode) {
    return invalidResult('codeRequired', selectedQrCode);
  }

  if (!selectedDeviceId) {
    return invalidResult('deviceIdMissing', selectedQrCode);
  }

  let response;
  try {
    response = await scanTicketOnline(
      {
        qrCode: selectedQrCode,
        concertId: selectedConcertId,
        deviceId: selectedDeviceId,
        gate: gate.trim() || null,
      },
      accessToken,
    );
  } catch (error) {
    if (error instanceof ApiClientError && error.unreachable) {
      return performManualOfflineCheckin({ concertId, qrCode, gate });
    }
    throw error;
  }

  const accepted = response.status === 'SUCCESS';

  if (accepted) {
    try {
      await insertLocalCheckinLog({
        concertId: selectedConcertId,
        qrCode: selectedQrCode,
        checkedAt: response.checkAt,
        gate: gate.trim() || null,
        status: 'SYNCED',
      });
    } catch {
      return {
        inserted: false,
        result: {
          status: 'ONLINE_ACCEPTED',
          message: 'admitStorageWarning',
          checkedAt: response.checkAt,
          qrCode: selectedQrCode,
        },
      };
    }
  }

  return {
    inserted: accepted,
    result: {
      status: accepted ? 'ONLINE_ACCEPTED' : 'ONLINE_FAILED',
      message: accepted ? 'checkinConfirmed' : 'rejectedHint',
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

function invalidResult(message: MessageKey, qrCode: string): ManualCheckinOutcome {
  return {
    inserted: false,
    result: {
      status: 'INVALID_LOCAL',
      message,
      qrCode,
    },
  };
}
