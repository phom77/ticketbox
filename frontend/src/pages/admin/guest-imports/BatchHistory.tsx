import { ChevronLeft, ChevronRight, Eye, FileClock, RefreshCw, RotateCcw } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import type { BatchLog } from '../../../api/admin';
import type { ConcertDetail } from '../../../api/concerts';
import { WorkspaceSelect } from '../../../components/WorkspaceSelect';
import { translate } from '../../../i18n';
import { BatchStatus } from './BatchStatus';
import { dateTime, duration, sourceLabel, sources, statuses } from './batchLabels';
import type { useBatchLogs } from './useBatchLogs';

/** Filterable, paged history of guest-list batches. */
export function BatchHistory({
  concerts,
  concertNames,
  history,
  openDetail,
}: {
  concerts: ConcertDetail[];
  concertNames: Map<string, string>;
  history: ReturnType<typeof useBatchLogs>;
  openDetail: (log: BatchLog) => void;
}) {
  useTranslation();
  const {
    logs,
    loadingLogs,
    logsError,
    logsNotFound,
    page,
    concertFilter,
    statusFilter,
    sourceFilter,
    loadLogs,
    updateFilters,
    clearFilters,
  } = history;
  return (
    <section className="guest-log-section">
      <div className="guest-log-header">
        <div>
          <span>{translate('admin:adminGuestImportsPage_lichSuXuLy')}</span>
          <h2>{translate('batchImport')}</h2>
        </div>
        <button type="button" onClick={() => void loadLogs()} disabled={loadingLogs}>
          <RefreshCw aria-hidden="true" size={16} />
          {translate('admin:adminGuestImportsPage_lamMoi')}
        </button>
      </div>
      <div className="guest-log-filters">
        <label>
          <span>{translate('event')}</span>
          <WorkspaceSelect
            label={translate('event')}
            value={concertFilter}
            onChange={(concertId) => updateFilters({ concertId })}
            options={[
              { value: '', label: translate('admin:adminGuestImportsPage_tatCaConcert') },
              ...concerts.map(({ id, title }) => ({ value: id, label: title })),
            ]}
          />
        </label>
        <label>
          <span>{translate('admin:adminGuestImportsPage_trangThai')}</span>
          <WorkspaceSelect
            label={translate('admin:adminGuestImportsPage_trangThai')}
            value={statusFilter}
            options={statuses}
            onChange={(status) => updateFilters({ status })}
          />
        </label>
        <label>
          <span>{translate('admin:adminGuestImportsPage_nguon')}</span>
          <WorkspaceSelect
            label={translate('admin:adminGuestImportsPage_nguon')}
            value={sourceFilter}
            options={sources}
            onChange={(source) => updateFilters({ source })}
          />
        </label>
        <button
          type="button"
          onClick={clearFilters}
          disabled={!concertFilter && !statusFilter && !sourceFilter && page === 0}
        >
          <RotateCcw aria-hidden="true" size={15} />
          {translate('admin:adminGuestImportsPage_xoaBoLoc')}
        </button>
      </div>

      {logsNotFound ? (
        <div className="admin-notice" role="status">
          <strong>{translate('event-content:guestsNotAvailableTitle')}</strong>{' '}
          {translate('event-content:guestsNotAvailableBody')}
        </div>
      ) : null}
      {logsError ? (
        <div className="admin-notice error" role="alert">
          {logsError}
        </div>
      ) : null}
      <div className="admin-data-panel">
        {loadingLogs ? (
          <div
            className="admin-row-skeleton"
            aria-label={translate('admin:adminGuestImportsPage_dangTaiLichSuImport')}
            aria-live="polite"
          >
            {[1, 2, 3, 4].map((item) => (
              <span key={item} />
            ))}
          </div>
        ) : logs?.content.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table guest-log-table">
              <thead>
                <tr>
                  <th>{translate('file')}</th>
                  <th>{translate('event')}</th>
                  <th>{translate('admin:adminGuestImportsPage_nguon')}</th>
                  <th>{translate('admin:adminGuestImportsPage_ketQua')}</th>
                  <th>{translate('admin:adminGuestImportsPage_batDau')}</th>
                  <th>
                    <span className="sr-only">
                      {translate('admin:adminGuestImportsPage_thaoTac')}
                    </span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {logs.content.map((log) => (
                  <tr key={log.id}>
                    <td>
                      <strong className="admin-table-primary">
                        {log.fileName ?? translate('admin:adminGuestImportsPage_khongCoTenFile')}
                      </strong>
                    </td>
                    <td>
                      <strong className="admin-table-primary">
                        {concertNames.get(log.concertId ?? '') ??
                          translate('admin:adminGuestImportsPage_concertKhongXacDinh')}
                      </strong>
                    </td>
                    <td>
                      <span className="guest-source-label">{sourceLabel(log.source)}</span>
                    </td>
                    <td>
                      <BatchStatus status={log.status} />
                      <span className="admin-table-secondary">
                        {log.successRows} {translate('admin:adminGuestImportsPage_thanhCong_2')}{' '}
                        {log.errorRows} {translate('admin:adminGuestImportsPage_loi')}
                      </span>
                    </td>
                    <td>
                      <strong className="admin-table-primary">
                        {dateTime.format(new Date(log.startedAt))}
                      </strong>
                      <span className="admin-table-secondary">{duration(log)}</span>
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <button
                          type="button"
                          aria-label={translate('admin:adminGuestImportsPage_xemChiTiet', {
                            arg1:
                              log.fileName ??
                              translate('admin:adminGuestImportsPage_khongCoTenFile'),
                          })}
                          onClick={() => openDetail(log)}
                        >
                          <Eye aria-hidden="true" size={16} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <FileClock aria-hidden="true" size={28} />
            <h2>{translate('admin:adminGuestImportsPage_chuaCoBatchPhuHop')}</h2>
            <p>{translate('admin:adminGuestImportsPage_thayDoiBoLocHoacTaiLen')}</p>
          </div>
        )}
      </div>

      {logs && logs.totalPages > 1 ? (
        <div className="admin-pagination">
          <span>{translate('pageNumber', { page: logs.number + 1, total: logs.totalPages })}</span>
          <div>
            <button
              type="button"
              aria-label={translate('admin:adminGuestImportsPage_trangTruoc')}
              disabled={logs.first}
              onClick={() => updateFilters({ page: String(page - 1) })}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              aria-label={translate('pageNext')}
              disabled={logs.last}
              onClick={() => updateFilters({ page: String(page + 1) })}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
