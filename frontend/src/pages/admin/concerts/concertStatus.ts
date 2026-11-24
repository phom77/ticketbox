import type { ConcertStatus } from '../../../api/concerts';
import { dateFormatter } from '../../../data/formatters';
import { translate } from '../../../i18n';

export const statuses: Array<{ value: '' | ConcertStatus; label: string }> = [
  {
    value: '',
    get label() {
      return translate('admin:adminConcertsPage_tatCaTrangThai');
    },
  },
  {
    value: 'DRAFT',
    get label() {
      return translate('admin:adminConcertsPage_banNhap');
    },
  },
  {
    value: 'ON_SALE',
    get label() {
      return translate('admin:adminConcertsPage_dangBan');
    },
  },
  {
    value: 'SOLD_OUT',
    get label() {
      return translate('admin:adminConcertsPage_hetVe');
    },
  },
  {
    value: 'COMPLETED',
    get label() {
      return translate('admin:adminConcertsPage_daKetThuc');
    },
  },
  {
    value: 'CANCELLED',
    get label() {
      return translate('admin:adminConcertsPage_daHuy');
    },
  },
];

export const transitions: Record<ConcertStatus, ConcertStatus[]> = {
  DRAFT: ['CANCELLED'],
  ON_SALE: ['SOLD_OUT', 'COMPLETED', 'CANCELLED'],
  SOLD_OUT: ['ON_SALE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

export const dateTime = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function statusLabel(status: ConcertStatus) {
  return statuses.find((item) => item.value === status)?.label ?? status;
}
