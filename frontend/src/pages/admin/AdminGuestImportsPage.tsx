import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Eye,
  FileClock,
  FileText,
  RefreshCw,
  RotateCcw,
  UploadCloud,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  getAdminConcerts,
  getBatchLog,
  getBatchLogs,
  getConcertGuestList,
  importGuestList,
  type BatchLog,
  type BatchLogSource,
  type BatchLogStatus,
  type GuestListEntry,
  type ManagementApiScope,
} from '../../api/admin';
import type { ConcertDetail, Page } from '../../api/concerts';
import { commandMessage, isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ConcertPicker } from '../../components/admin/ConcertPicker';
import { useToast } from '../../components/feedback/toast-context';
import { ModalPortal } from '../../components/feedback/ModalPortal';

const statuses: Array<{ value: '' | BatchLogStatus; label: string }> = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'PENDING', label: 'Chờ scheduler' },
  { value: 'RUNNING', label: 'Đang xử lý' },
  { value: 'SUCCESS', label: 'Thành công' },
  { value: 'PARTIAL', label: 'Một phần' },
  { value: 'FAILED', label: 'Thất bại' },
  { value: 'SKIPPED', label: 'Đã bỏ qua' },
];

const sources: Array<{ value: '' | BatchLogSource; label: string }> = [
  { value: '', label: 'Tất cả nguồn' },
  { value: 'UPLOAD', label: 'Tải lên thủ công' },
  { value: 'SCHEDULED', label: 'Theo lịch' },
];

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function statusLabel(status: BatchLogStatus) {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

function sourceLabel(source: BatchLogSource | null) {
  return sources.find((item) => item.value === source)?.label ?? 'Không xác định';
}

function duration(log: BatchLog) {
  if (!log.completedAt) return log.status === 'PENDING' ? 'Đang chờ lịch quét' : 'Đang chạy';
  const seconds = Math.max(
    0,
    Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000),
  );
  if (seconds < 60) return `${seconds} giây`;
  return `${Math.floor(seconds / 60)} phút ${seconds % 60} giây`;
}

function isActiveBatch(status: BatchLogStatus) {
  return status === 'PENDING' || status === 'RUNNING';
}

export function AdminGuestImportsPage({
  apiScope = 'admin',
  uploadMode = 'immediate',
}: {
  apiScope?: ManagementApiScope;
  uploadMode?: 'immediate' | 'scheduled';
}) {
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const root = apiScope === 'admin' ? '/admin' : '/organizer';
  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo?.startsWith(`${root}/concerts/`) ? returnTo : '';
  const [concerts, setConcerts] = useState<ConcertDetail[]>([]);
  const [logs, setLogs] = useState<Page<BatchLog> | null>(null);
  const [loadingConcerts, setLoadingConcerts] = useState(true);
  const [loadingLogs, setLoadingLogs] = useState(true);
  const [logsError, setLogsError] = useState('');
  const [uploadConcertId, setUploadConcertId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [latestBatch, setLatestBatch] = useState<BatchLog | null>(null);
  const [selectedLog, setSelectedLog] = useState<BatchLog | null>(null);
  const [selectedLogGuests, setSelectedLogGuests] = useState<GuestListEntry[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedLogIdRef = useRef<string | null>(null);

  useEffect(() => {
    selectedLogIdRef.current = selectedLog?.id ?? null;
  }, [selectedLog?.id]);

  const page = Math.max(0, Math.floor(Number(searchParams.get('page')) || 0));
  const concertFilter = searchParams.get('concertId') ?? '';
  const statusValue = searchParams.get('status') ?? '';
  const sourceValue = searchParams.get('source') ?? '';
  const statusFilter = statuses.some((item) => item.value === statusValue)
    ? (statusValue as '' | BatchLogStatus)
    : '';
  const sourceFilter = sources.some((item) => item.value === sourceValue)
    ? (sourceValue as '' | BatchLogSource)
    : '';

  useEffect(() => {
    const controller = new AbortController();
    async function loadConcerts() {
      setLoadingConcerts(true);
      try {
        const data = await getAdminConcerts(0, 100, undefined, controller.signal, apiScope);
        setConcerts(data.content);
        setUploadConcertId((current) => current || concertFilter || data.content[0]?.id || '');
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : 'Không thể tải danh sách concert.',
          );
        }
      } finally {
        if (!controller.signal.aborted) setLoadingConcerts(false);
      }
    }
    void loadConcerts();
    return () => controller.abort();
  }, [apiScope, concertFilter, toast]);

  const loadLogs = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (!silent) setLoadingLogs(true);
      setLogsError('');
      try {
        setLogs(
          await getBatchLogs(
            {
              page,
              size: 20,
              concertId: concertFilter || undefined,
              status: statusFilter || undefined,
              source: sourceFilter || undefined,
            },
            signal,
            apiScope,
          ),
        );
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          setLogsError(
            requestError instanceof Error ? requestError.message : 'Không thể tải lịch sử import.',
          );
        }
      } finally {
        if (!signal?.aborted && !silent) setLoadingLogs(false);
      }
    },
    [apiScope, concertFilter, page, sourceFilter, statusFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadLogs(controller.signal);
    return () => controller.abort();
  }, [loadLogs]);

  const hasRunningLog = logs?.content.some((log) => isActiveBatch(log.status)) ?? false;
  useEffect(() => {
    if (!hasRunningLog) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadLogs(undefined, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasRunningLog, loadLogs]);

  useEffect(() => {
    if (!selectedLog || !isActiveBatch(selectedLog.status)) return;
    const controller = new AbortController();
    let requestInFlight = false;
    const timer = window.setInterval(async () => {
      if (requestInFlight) return;
      if (document.visibilityState !== 'visible') return;
      requestInFlight = true;
      try {
        const updated = await getBatchLog(selectedLog.id, controller.signal, apiScope);
        setSelectedLog(updated);
        setLatestBatch((current) => (current?.id === updated.id ? updated : current));
        if (!isActiveBatch(updated.status)) {
          void loadLogs(undefined, true);
          if (updated.concertId) {
            setDetailLoading(true);
            void getConcertGuestList(updated.concertId, 0, 100, undefined, apiScope)
              .then((guestPage) => {
                if (selectedLogIdRef.current === updated.id) {
                  setSelectedLogGuests(guestPage.content);
                }
              })
              .catch((requestError) => {
                if (!isRequestCanceled(requestError)) {
                  toast.error(
                    requestError instanceof Error
                      ? requestError.message
                      : 'KhĂ´ng thá»ƒ cáº­p nháº­t danh sĂ¡ch khĂ¡ch má»i.',
                  );
                }
              })
              .finally(() => {
                if (selectedLogIdRef.current === updated.id) setDetailLoading(false);
              });
          }
        }
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : 'Không thể cập nhật trạng thái import.',
          );
        }
      } finally {
        requestInFlight = false;
      }
    }, 3000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [apiScope, loadLogs, selectedLog, toast]);

  useEffect(() => {
    if (!latestBatch || !isActiveBatch(latestBatch.status) || selectedLog?.id === latestBatch.id)
      return;
    const controller = new AbortController();
    let requestInFlight = false;
    const timer = window.setInterval(async () => {
      if (requestInFlight || document.visibilityState !== 'visible') return;
      requestInFlight = true;
      try {
        const updated = await getBatchLog(latestBatch.id, controller.signal, apiScope);
        setLatestBatch(updated);
        if (!isActiveBatch(updated.status)) void loadLogs(undefined, true);
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : 'Không thể cập nhật batch gần nhất.',
          );
        }
      } finally {
        requestInFlight = false;
      }
    }, 3000);
    return () => {
      controller.abort();
      window.clearInterval(timer);
    };
  }, [apiScope, latestBatch, loadLogs, selectedLog?.id, toast]);

  const concertNames = useMemo(
    () => new Map(concerts.map((concert) => [concert.id, concert.title])),
    [concerts],
  );

  function updateFilters(values: Record<string, string>) {
    const next = new URLSearchParams(searchParams);
    Object.entries(values).forEach(([key, value]) =>
      value ? next.set(key, value) : next.delete(key),
    );
    if (!('page' in values)) next.delete('page');
    setSearchParams(next, { replace: true });
  }

  function chooseFile(nextFile: File | null) {
    if (!nextFile) {
      setFile(null);
      return;
    }
    if (!nextFile.name.toLowerCase().endsWith('.csv')) {
      setFile(null);
      toast.error('Chỉ chấp nhận file có định dạng .csv.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (nextFile.size === 0) {
      setFile(null);
      toast.error('File CSV không được để trống.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setFile(null);
      toast.error('File CSV không được vượt quá 10 MB.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(nextFile);
  }

  async function submitUpload(event: FormEvent) {
    event.preventDefault();
    if (!file || !uploadConcertId) return;
    setUploading(true);
    try {
      const scheduled = uploadMode === 'scheduled';
      const result = await importGuestList(uploadConcertId, file, apiScope, scheduled);
      toast.success(
        commandMessage(
          result.message,
          scheduled ? 'Đã xếp file CSV vào hàng chờ scheduler.' : 'Đã tiếp nhận file CSV để xử lý.',
        ),
      );
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      try {
        const detail = await getBatchLog(result.data.batchLogId, undefined, apiScope);
        setLatestBatch(detail);
        setSelectedLogGuests([]);
        selectedLogIdRef.current = detail.id;
        setSelectedLog(detail);
        if (!isActiveBatch(detail.status) && detail.concertId) {
          setDetailLoading(true);
          void getConcertGuestList(detail.concertId, 0, 100, undefined, apiScope)
            .then((guestPage) => {
              if (selectedLogIdRef.current === detail.id) {
                setSelectedLogGuests(guestPage.content);
              }
            })
            .catch((requestError) => {
              if (!isRequestCanceled(requestError)) {
                toast.error(
                  requestError instanceof Error
                    ? requestError.message
                    : 'KhĂ´ng thá»ƒ táº£i danh sĂ¡ch khĂ¡ch má»i.',
                );
              }
            })
            .finally(() => {
              if (selectedLogIdRef.current === detail.id) setDetailLoading(false);
            });
        }
      } catch (detailError) {
        toast.error(
          detailError instanceof Error
            ? `File đã được tiếp nhận nhưng chưa tải được trạng thái: ${detailError.message}`
            : 'File đã được tiếp nhận nhưng chưa tải được trạng thái.',
        );
      }
      await loadLogs(undefined, true);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'Không thể tải file CSV lên.',
      );
    } finally {
      setUploading(false);
    }
  }

  async function openDetail(log: BatchLog) {
    setSelectedLog(log);
    setDetailLoading(true);
    setSelectedLogGuests([]);
    try {
      const [detail, guestPage] = await Promise.all([
        getBatchLog(log.id, undefined, apiScope),
        log.concertId
          ? getConcertGuestList(log.concertId, 0, 100, undefined, apiScope)
          : Promise.resolve(null),
      ]);
      setSelectedLog(detail);
      setSelectedLogGuests(guestPage?.content ?? []);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'Không thể tải chi tiết batch.',
      );
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Vận hành khách mời"
        title="Import khách mời"
        description={
          uploadMode === 'scheduled'
            ? 'Đưa danh sách CSV vào hàng chờ định kỳ, theo dõi tiến trình và kiểm tra các dòng được nhập hoặc bị từ chối.'
            : 'Tiếp nhận danh sách CSV, theo dõi tiến trình xử lý và kiểm tra các dòng được nhập hoặc bị từ chối.'
        }
        actions={
          safeReturnTo ? (
            <Link className="admin-secondary-action" to={safeReturnTo}>
              Quay về concert
            </Link>
          ) : undefined
        }
      />

      <section className="guest-import-workspace">
        <form className="guest-upload-panel" onSubmit={submitUpload}>
          <div className="guest-section-heading">
            <div>
              <span>{uploadMode === 'scheduled' ? 'Import theo lịch' : 'Import thủ công'}</span>
              <h2>Tải danh sách mới</h2>
            </div>
            <UploadCloud aria-hidden="true" size={22} />
          </div>
          <ConcertPicker
            concerts={concerts}
            value={uploadConcertId}
            onChange={setUploadConcertId}
            label="Concert nhận khách mời"
            placeholder={loadingConcerts ? 'Đang tải concert...' : 'Chọn concert nhận danh sách'}
            disabled={loadingConcerts || uploading || !concerts.length}
          />
          <label className={`guest-file-picker ${file ? 'has-file' : ''}`}>
            <FileText aria-hidden="true" size={24} />
            <span>{file ? file.name : 'Chọn file CSV'}</span>
            <small>{file ? `${(file.size / 1024).toFixed(1)} KB` : 'Tối đa 10 MB'}</small>
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => chooseFile(event.target.files?.[0] ?? null)}
              disabled={uploading}
            />
          </label>
          <button
            className="admin-primary-action"
            type="submit"
            disabled={!file || !uploadConcertId || uploading}
          >
            <UploadCloud aria-hidden="true" size={17} />
            {uploading
              ? 'Đang gửi file...'
              : uploadMode === 'scheduled'
                ? 'Đưa vào hàng chờ'
                : 'Bắt đầu import'}
          </button>
        </form>

        <div className="guest-latest-panel">
          <div className="guest-section-heading">
            <div>
              <span>Tiến trình gần nhất</span>
              <h2>Trạng thái xử lý</h2>
            </div>
            <FileClock aria-hidden="true" size={22} />
          </div>
          {latestBatch ? (
            <BatchSnapshot
              log={latestBatch}
              concertName={concertNames.get(latestBatch.concertId ?? '')}
              onOpen={() => void openDetail(latestBatch)}
            />
          ) : (
            <div className="guest-latest-empty">
              <p>Batch vừa tải lên sẽ xuất hiện tại đây.</p>
            </div>
          )}
        </div>
      </section>

      <section className="guest-log-section">
        <div className="guest-log-header">
          <div>
            <span>Lịch sử xử lý</span>
            <h2>Batch import</h2>
          </div>
          <button type="button" onClick={() => void loadLogs()} disabled={loadingLogs}>
            <RefreshCw aria-hidden="true" size={16} />
            Làm mới
          </button>
        </div>
        <div className="guest-log-filters">
          <label>
            <span>Concert</span>
            <select
              value={concertFilter}
              onChange={(event) => updateFilters({ concertId: event.target.value })}
            >
              <option value="">Tất cả concert</option>
              {concerts.map((concert) => (
                <option key={concert.id} value={concert.id}>
                  {concert.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Trạng thái</span>
            <select
              value={statusFilter}
              onChange={(event) => updateFilters({ status: event.target.value })}
            >
              {statuses.map((item) => (
                <option key={item.value || 'all'} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>Nguồn</span>
            <select
              value={sourceFilter}
              onChange={(event) => updateFilters({ source: event.target.value })}
            >
              {sources.map((item) => (
                <option key={item.value || 'all'} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            disabled={!concertFilter && !statusFilter && !sourceFilter && page === 0}
          >
            <RotateCcw aria-hidden="true" size={15} />
            Xóa bộ lọc
          </button>
        </div>

        {logsError ? (
          <div className="admin-notice error" role="alert">
            {logsError}
          </div>
        ) : null}
        <div className="admin-data-panel">
          {loadingLogs ? (
            <div
              className="admin-row-skeleton"
              aria-label="Đang tải lịch sử import"
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
                    <th>File</th>
                    <th>Concert</th>
                    <th>Nguồn</th>
                    <th>Kết quả</th>
                    <th>Bắt đầu</th>
                    <th>
                      <span className="sr-only">Thao tác</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.content.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <strong className="admin-table-primary">
                          {log.fileName ?? 'Không có tên file'}
                        </strong>
                        <span className="admin-table-secondary">{log.id.slice(0, 8)}</span>
                      </td>
                      <td>
                        <strong className="admin-table-primary">
                          {concertNames.get(log.concertId ?? '') ?? 'Concert không xác định'}
                        </strong>
                      </td>
                      <td>
                        <span className="guest-source-label">{sourceLabel(log.source)}</span>
                      </td>
                      <td>
                        <BatchStatus status={log.status} />
                        <span className="admin-table-secondary">
                          {log.successRows} thành công · {log.errorRows} lỗi
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
                            aria-label={`Xem chi tiết ${log.fileName ?? log.id}`}
                            onClick={() => void openDetail(log)}
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
              <h2>Chưa có batch phù hợp</h2>
              <p>Thay đổi bộ lọc hoặc tải lên danh sách khách mời đầu tiên.</p>
            </div>
          )}
        </div>

        {logs && logs.totalPages > 1 ? (
          <div className="admin-pagination">
            <span>
              Trang {logs.number + 1} / {logs.totalPages}
            </span>
            <div>
              <button
                type="button"
                aria-label="Trang trước"
                disabled={logs.first}
                onClick={() => updateFilters({ page: String(page - 1) })}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                aria-label="Trang sau"
                disabled={logs.last}
                onClick={() => updateFilters({ page: String(page + 1) })}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedLog ? (
        <BatchDetailDialog
          log={selectedLog}
          guests={selectedLogGuests}
          concertName={concertNames.get(selectedLog.concertId ?? '')}
          loading={detailLoading}
          showTechnicalDetails={apiScope === 'admin'}
          onClose={() => setSelectedLog(null)}
        />
      ) : null}
    </>
  );
}

function BatchStatus({ status }: { status: BatchLogStatus }) {
  return (
    <span className={`batch-status batch-${status.toLowerCase()}`}>
      {isActiveBatch(status) ? <i aria-hidden="true" /> : null}
      {statusLabel(status)}
    </span>
  );
}

function BatchSnapshot({
  log,
  concertName,
  onOpen,
}: {
  log: BatchLog;
  concertName?: string;
  onOpen: () => void;
}) {
  return (
    <div className="guest-batch-snapshot">
      <div>
        <BatchStatus status={log.status} />
        <span>{sourceLabel(log.source)}</span>
      </div>
      {isActiveBatch(log.status) ? (
        <div
          className="guest-indeterminate"
          aria-label={log.status === 'PENDING' ? 'Đang chờ scheduler' : 'Đang xử lý'}
        >
          <span />
        </div>
      ) : null}
      <h3>{log.fileName ?? 'Danh sách khách mời'}</h3>
      <p>{concertName ?? 'Concert không xác định'}</p>
      <div className="guest-batch-counts">
        <span>
          <strong>{log.totalRows}</strong>Tổng dòng
        </span>
        <span>
          <strong>{log.successRows}</strong>Thành công
        </span>
        <span>
          <strong>{log.errorRows}</strong>Lỗi
        </span>
      </div>
      <button type="button" onClick={onOpen}>
        Xem chi tiết <Eye aria-hidden="true" size={15} />
      </button>
    </div>
  );
}

function BatchDetailDialog({
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
            <span>Chi tiết batch</span>
            <h2 id="batch-detail-title">{log.fileName ?? 'Chi tiết import'}</h2>
          </div>
          <button type="button" aria-label="Đóng" onClick={onClose} autoFocus>
            <X size={20} />
          </button>
        </header>
        <div className="batch-detail-body">
          {loading ? (
            <div className="batch-detail-loading">Đang tải dữ liệu mới nhất...</div>
          ) : null}
          <div className="batch-detail-lead">
            <BatchStatus status={log.status} />
            <strong>{concertName ?? 'Concert không xác định'}</strong>
            <span>{sourceLabel(log.source)}</span>
          </div>
          {isActiveBatch(log.status) ? (
            <div
              className="guest-indeterminate"
              aria-label={log.status === 'PENDING' ? 'Đang chờ scheduler' : 'Đang xử lý'}
            >
              <span />
            </div>
          ) : null}
          <dl className="batch-detail-counts">
            <div>
              <dt>Tổng dòng</dt>
              <dd>{log.totalRows}</dd>
            </div>
            <div>
              <dt>Thành công</dt>
              <dd>{log.successRows}</dd>
            </div>
            <div>
              <dt>Lỗi</dt>
              <dd>{log.errorRows}</dd>
            </div>
          </dl>
          <dl className="batch-detail-meta">
            <div>
              <dt>Bắt đầu</dt>
              <dd>{dateTime.format(new Date(log.startedAt))}</dd>
            </div>
            <div>
              <dt>Hoàn tất</dt>
              <dd>{log.completedAt ? dateTime.format(new Date(log.completedAt)) : 'Đang xử lý'}</dd>
            </div>
            <div>
              <dt>Thời lượng</dt>
              <dd>{duration(log)}</dd>
            </div>
            {showTechnicalDetails ? (
              <div>
                <dt>Checksum</dt>
                <dd>
                  <code>{log.checksum ?? 'Không có'}</code>
                </dd>
              </div>
            ) : null}
            {showTechnicalDetails ? (
              <div>
                <dt>File lưu trữ</dt>
                <dd>
                  <code>{log.filePath ?? 'Không có'}</code>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>Báo cáo lỗi</dt>
              <dd>
                <code>{log.errorReportPath ?? 'Không có'}</code>
              </dd>
            </div>
          </dl>
          {log.errorDetail ? (
            <div className="batch-error-detail">
              <span>Chi tiết lỗi</span>
              <p>{log.errorDetail}</p>
            </div>
          ) : null}
          <section className="batch-guest-preview">
            <div className="batch-guest-preview-heading">
              <div>
                <span>Danh sách khách mời</span>
                <h3>Danh sách khách mời của concert</h3>
              </div>
              <strong>{guests.length} khách</strong>
            </div>
            {guests.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>Khách mời</th>
                      <th>Hạng</th>
                      <th>Sponsor</th>
                      <th>Trạng thái</th>
                      <th>Check-in</th>
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
                            {guest.active ? 'Hiệu lực' : 'Đã hủy'}
                          </span>
                        </td>
                        <td>
                          {guest.checkedInAt
                            ? dateTime.format(new Date(guest.checkedInAt))
                            : 'Chưa vào'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty-state compact">
                <FileText aria-hidden="true" size={22} />
                <h2>Chưa có khách mời</h2>
                <p>Batch có thể đang xử lý hoặc concert này chưa có danh sách khách.</p>
              </div>
            )}
          </section>
        </div>
      </section>
      </div>
    </ModalPortal>
  );
}
