import type { LocalCheckinStatus } from '../../database';
import type { ManualCheckinResult } from './manualCheckin';

export const admissionStatus = {
  confirmed: { label: 'confirmed', tone: 'success', icon: 'check-circle-outline' },
  pending: { label: 'pending', tone: 'warning', icon: 'schedule' },
  duplicate: { label: 'duplicate', tone: 'warning', icon: 'history' },
  rejected: { label: 'rejected', tone: 'danger', icon: 'error-outline' },
  conflict: { label: 'syncConflict', tone: 'danger', icon: 'error-outline' },
  failed: { label: 'syncFailed', tone: 'danger', icon: 'error-outline' },
  signedOut: { label: 'expired', tone: 'danger', icon: 'lock-outline' },
  forbidden: { label: 'forbidden', tone: 'danger', icon: 'lock-outline' },
  unavailable: { label: 'missingCode', tone: 'warning', icon: 'cloud-off' },
  error: { label: 'scanError', tone: 'danger', icon: 'error-outline' },
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
  return result.status === 'ONLINE_ACCEPTED' ? { ...status, label: 'admit' as const } : status;
}
