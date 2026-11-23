import type { SupportQueueKind } from '../../api/supportQueue';
import { translate } from '../../i18n';

export const supportQueueLabels: Record<SupportQueueKind, string> = {
  get UNKNOWN_PAYMENT() { return translate('admin:orderSupportQueue_giaoDichChuaRoKetQua'); },
  get MISSING_TICKETS() { return translate('admin:orderSupportQueue_daThanhToanThieuVe'); },
  get PENDING_REFUND() { return translate('admin:orderSupportQueue_choXuLyHoanTien'); },
  get FAILED_EMAIL() { return translate('admin:orderSupportQueue_emailVeGuiLoi'); },
};

export function isSupportQueueKind(value: string | null): value is SupportQueueKind {
  return value !== null && Object.prototype.hasOwnProperty.call(supportQueueLabels, value);
}
