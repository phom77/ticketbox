import { Eye } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BatchLog } from '../../../api/admin';
import { translate } from '../../../i18n';
import { BatchStatus } from './BatchStatus';
import { isActiveBatch, sourceLabel } from './batchLabels';

export function BatchSnapshot({
  log,
  concertName,
  onOpen,
}: {
  log: BatchLog;
  concertName?: string;
  onOpen: () => void;
}) {
  useTranslation();
  return (
    <div className="guest-batch-snapshot">
      <div>
        <BatchStatus status={log.status} />
        <span>{sourceLabel(log.source)}</span>
      </div>
      {isActiveBatch(log.status) ? (
        <div
          className="guest-indeterminate"
          aria-label={
            log.status === 'PENDING'
              ? translate('admin:adminGuestImportsPage_dangChoScheduler')
              : translate('admin:adminGuestImportsPage_dangXuLy')
          }
        >
          <span />
        </div>
      ) : null}
      <h3>{log.fileName ?? translate('admin:adminGuestImportsPage_danhSachKhachMoi')}</h3>
      <p>{concertName ?? translate('admin:adminGuestImportsPage_concertKhongXacDinh')}</p>
      <div className="guest-batch-counts">
        <span>
          <strong>{log.totalRows}</strong>
          {translate('admin:adminGuestImportsPage_tongDong')}
        </span>
        <span>
          <strong>{log.successRows}</strong>
          {translate('admin:adminGuestImportsPage_thanhCong')}
        </span>
        <span>
          <strong>{log.errorRows}</strong>
          {translate('admin:adminGuestImportsPage_loi_2')}
        </span>
      </div>
      <button type="button" onClick={onOpen}>
        {translate('admin:adminGuestImportsPage_xemChiTiet_2')} <Eye aria-hidden="true" size={15} />
      </button>
    </div>
  );
}
