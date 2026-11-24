import { useEffect } from 'react';
import { FileText, X } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BatchLog, GuestListEntry } from '../../../api/admin';
import { ModalPortal } from '../../../components/feedback/ModalPortal';
import { translate } from '../../../i18n';
import { BatchStatus } from './BatchStatus';
import { dateTime, duration, isActiveBatch, sourceLabel } from './batchLabels';

export function BatchDetailDialog({
  log,
  guests,
  concertName,
  loading,
  showTechnicalDetails,
  onClose,
}: {
  log: BatchLog;
  guests: GuestListEntry[];
  concertName?: string;
  loading: boolean;
  showTechnicalDetails: boolean;
  onClose: () => void;
}) {
  useTranslation();
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <ModalPortal>
      <div
        className="admin-dialog-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
      >
        <section
          className="admin-dialog admin-dialog-compact batch-detail-dialog"
          role="dialog"
          aria-modal="true"
          aria-labelledby="batch-detail-title"
        >
          <header>
            <div>
              <span>{translate('admin:adminGuestImportsPage_chiTietBatch')}</span>
              <h2 id="batch-detail-title">
                {log.fileName ?? translate('admin:adminGuestImportsPage_chiTietImport')}
              </h2>
            </div>
            <button
              type="button"
              aria-label={translate('admin:adminGuestImportsPage_dong')}
              onClick={onClose}
              autoFocus
            >
              <X size={20} />
            </button>
          </header>
          <div className="batch-detail-body">
            {loading ? (
              <div className="batch-detail-loading">
                {translate('admin:adminGuestImportsPage_dangTaiDuLieuMoiNhat')}
              </div>
            ) : null}
            <div className="batch-detail-lead">
              <BatchStatus status={log.status} />
              <strong>
                {concertName ?? translate('admin:adminGuestImportsPage_concertKhongXacDinh')}
              </strong>
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
            <dl className="batch-detail-counts">
              <div>
                <dt>{translate('admin:adminGuestImportsPage_tongDong')}</dt>
                <dd>{log.totalRows}</dd>
              </div>
              <div>
                <dt>{translate('admin:adminGuestImportsPage_thanhCong')}</dt>
                <dd>{log.successRows}</dd>
              </div>
              <div>
                <dt>{translate('admin:adminGuestImportsPage_loi_2')}</dt>
                <dd>{log.errorRows}</dd>
              </div>
            </dl>
            <dl className="batch-detail-meta">
              <div>
                <dt>{translate('admin:adminGuestImportsPage_batDau')}</dt>
                <dd>{dateTime.format(new Date(log.startedAt))}</dd>
              </div>
              <div>
                <dt>{translate('admin:adminGuestImportsPage_hoanTat')}</dt>
                <dd>
                  {log.completedAt
                    ? dateTime.format(new Date(log.completedAt))
                    : translate('admin:adminGuestImportsPage_dangXuLy')}
                </dd>
              </div>
              <div>
                <dt>{translate('admin:adminGuestImportsPage_thoiLuong')}</dt>
                <dd>{duration(log)}</dd>
              </div>
              {showTechnicalDetails ? (
                <div>
                  <dt>{translate('checksum')}</dt>
                  <dd>
                    <code>{log.checksum ?? translate('admin:adminGuestImportsPage_khongCo')}</code>
                  </dd>
                </div>
              ) : null}
              {showTechnicalDetails ? (
                <div>
                  <dt>{translate('admin:adminGuestImportsPage_fileLuuTru')}</dt>
                  <dd>
                    <code>{log.filePath ?? translate('admin:adminGuestImportsPage_khongCo')}</code>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt>{translate('admin:adminGuestImportsPage_baoCaoLoi')}</dt>
                <dd>
                  <code>
                    {log.errorReportPath ?? translate('admin:adminGuestImportsPage_khongCo')}
                  </code>
                </dd>
              </div>
            </dl>
            {log.errorDetail ? (
              <div className="batch-error-detail">
                <span>{translate('admin:adminGuestImportsPage_chiTietLoi')}</span>
                <p>{log.errorDetail}</p>
              </div>
            ) : null}
            <section className="batch-guest-preview">
              <div className="batch-guest-preview-heading">
                <div>
                  <span>{translate('admin:adminGuestImportsPage_danhSachKhachMoi')}</span>
                  <h3>{translate('admin:adminGuestImportsPage_danhSachKhachMoiCuaConcert')}</h3>
                </div>
                <strong>
                  {guests.length} {translate('admin:adminGuestImportsPage_khach')}
                </strong>
              </div>
              {guests.length ? (
                <div className="admin-table-wrap">
                  <table className="admin-table">
                    <thead>
                      <tr>
                        <th>{translate('admin:adminGuestImportsPage_khachMoi')}</th>
                        <th>{translate('admin:adminGuestImportsPage_hang')}</th>
                        <th>{translate('sponsor')}</th>
                        <th>{translate('admin:adminGuestImportsPage_trangThai')}</th>
                        <th>{translate('admin:adminGuestImportsPage_checkIn')}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {guests.map((guest) => (
                        <tr key={guest.id}>
                          <td>
                            <strong className="admin-table-primary">{guest.fullName}</strong>
                            <span className="admin-table-secondary">{guest.phone}</span>
                          </td>
                          <td>{guest.category ?? '—'}</td>
                          <td>{guest.sponsorName ?? '—'}</td>
                          <td>
                            <span
                              className={
                                guest.active
                                  ? 'status-badge badge-success'
                                  : 'status-badge badge-muted'
                              }
                            >
                              {guest.active
                                ? translate('admin:adminGuestImportsPage_hieuLuc')
                                : translate('admin:adminGuestImportsPage_daHuy')}
                            </span>
                          </td>
                          <td>
                            {guest.checkedInAt
                              ? dateTime.format(new Date(guest.checkedInAt))
                              : translate('admin:adminGuestImportsPage_chuaVao')}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="admin-empty-state compact">
                  <FileText aria-hidden="true" size={22} />
                  <h2>{translate('admin:adminGuestImportsPage_chuaCoKhachMoi')}</h2>
                  <p>{translate('admin:adminGuestImportsPage_batchCoTheDangXuLyHoac')}</p>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>
    </ModalPortal>
  );
}
