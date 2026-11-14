import type { LocalCheckinStatus } from '../../database';
import type { ManualCheckinResult } from './manualCheckin';

export const admissionStatus = {
  confirmed: { label: 'Đã xác nhận', tone: 'success', icon: 'check-circle-outline' },
  pending: { label: 'Chờ xác nhận', tone: 'warning', icon: 'schedule' },
  duplicate: { label: 'Mã đã quét trên thiết bị', tone: 'warning', icon: 'history' },
  rejected: { label: 'Vé không được chấp nhận', tone: 'danger', icon: 'error-outline' },
  conflict: { label: 'Xung đột đồng bộ', tone: 'danger', icon: 'error-outline' },
  failed: { label: 'Đồng bộ thất bại', tone: 'danger', icon: 'error-outline' },
  signedOut: { label: 'Phiên đăng nhập hết hạn', tone: 'danger', icon: 'lock-outline' },
  forbidden: { label: 'Không có quyền soát vé', tone: 'danger', icon: 'lock-outline' },
  unavailable: { label: 'Mã không có trong dữ liệu đã tải', tone: 'warning', icon: 'cloud-off' },
  error: { label: 'Không thể soát vé', tone: 'danger', icon: 'error-outline' },
} as const;

type AdmissionStatus = keyof typeof admissionStatus;

export const localAdmissionStatus = {
  SYNCED: 'confirmed',
  PENDING: 'pending',
  CONFLICT: 'conflict',
  FAILED: 'failed',
} as const satisfies Record<LocalCheckinStatus, AdmissionStatus>;

const resultStatus: Record<ManualCheckinResult['status'], AdmissionStatus> = {
  PENDING: 'pending',
  ONLINE_ACCEPTED: 'confirmed',
  DUPLICATE_LOCAL: 'duplicate',
  INVALID_LOCAL: 'unavailable',
  ONLINE_FAILED: 'rejected',
  UNAUTHENTICATED: 'signedOut',
  FORBIDDEN: 'forbidden',
  ERROR: 'error',
};

export function scanStatus(result: ManualCheckinResult) {
  const status = admissionStatus[resultStatus[result.status]];
  return result.status === 'ONLINE_ACCEPTED' ? { ...status, label: 'Cho phép vào cổng' } : status;
}
