import type { ManagementApiScope } from '../../../api/admin';
import type { ConcertDetail } from '../../../api/concerts';
import { dateFormatter, numberFormatter } from '../../../data/formatters';
import { translate } from '../../../i18n';

export const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });
export const money = numberFormatter({
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

export function managementRoot(scope: ManagementApiScope) {
  return scope === 'admin' ? '/admin' : '/organizer';
}

export const workspaceStatus: Record<ConcertDetail['status'], string> = {
  get DRAFT() {
    return translate('admin:concertWorkspacePage_banNhap');
  },
  get ON_SALE() {
    return translate('admin:concertWorkspacePage_daCauHinhMoBan');
  },
  get SOLD_OUT() {
    return translate('admin:concertWorkspacePage_hetVe');
  },
  get COMPLETED() {
    return translate('admin:concertWorkspacePage_daDienRa');
  },
  get CANCELLED() {
    return translate('admin:concertWorkspacePage_daHuy');
  },
};
