import type { BatchLog, BatchLogSource, BatchLogStatus } from '../../../api/admin';
import { dateFormatter } from '../../../data/formatters';
import { translate } from '../../../i18n';

export const statuses: Array<{ value: '' | BatchLogStatus; label: string }> = [
  {
    value: '',
    get label() {
      return translate('admin:adminGuestImportsPage_tatCaTrangThai');
    },
  },
  {
    value: 'PENDING',
    get label() {
      return translate('admin:adminGuestImportsPage_choScheduler');
    },
  },
  {
    value: 'RUNNING',
    get label() {
      return translate('admin:adminGuestImportsPage_dangXuLy');
    },
  },
  {
    value: 'SUCCESS',
    get label() {
      return translate('admin:adminGuestImportsPage_thanhCong');
    },
  },
  {
    value: 'PARTIAL',
    get label() {
      return translate('admin:adminGuestImportsPage_motPhan');
    },
  },
  {
    value: 'FAILED',
    get label() {
      return translate('admin:adminGuestImportsPage_thatBai');
    },
  },
  {
    value: 'SKIPPED',
    get label() {
      return translate('admin:adminGuestImportsPage_daBoQua');
    },
  },
];

export const sources: Array<{ value: '' | BatchLogSource; label: string }> = [
  {
    value: '',
    get label() {
      return translate('admin:adminGuestImportsPage_tatCaNguon');
    },
  },
  {
    value: 'UPLOAD',
    get label() {
      return translate('admin:adminGuestImportsPage_taiLenThuCong');
    },
  },
  {
    value: 'SCHEDULED',
    get label() {
      return translate('admin:adminGuestImportsPage_theoLich');
    },
  },
];

export const dateTime = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function statusLabel(status: BatchLogStatus) {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

export function sourceLabel(source: BatchLogSource | null) {
  return (
    sources.find((item) => item.value === source)?.label ??
    translate('admin:adminGuestImportsPage_khongXacDinh')
  );
}

export function duration(log: BatchLog) {
  if (!log.completedAt)
    return log.status === 'PENDING'
      ? translate('admin:adminGuestImportsPage_dangChoLichQuet')
      : translate('admin:adminGuestImportsPage_dangChay');
  const seconds = Math.max(
    0,
    Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000),
  );
  if (seconds < 60) return translate('admin:adminGuestImportsPage_giay', { arg1: seconds });
  return translate('admin:adminGuestImportsPage_phutGiay', {
    arg1: Math.floor(seconds / 60),
    arg2: seconds % 60,
  });
}

export function isActiveBatch(status: BatchLogStatus) {
  return status === 'PENDING' || status === 'RUNNING';
}
