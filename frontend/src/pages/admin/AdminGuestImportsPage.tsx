import { dateFormatter } from '../../data/formatters';
import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
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
import { isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ConcertPicker } from '../../components/admin/ConcertPicker';
import { useToast } from '../../components/feedback/toast-context';
import { ModalPortal } from '../../components/feedback/ModalPortal';

const statuses: Array<{ value: '' | BatchLogStatus; label: string }> = [
  { value: '', get label() { return translate("admin:adminGuestImportsPage_tatCaTrangThai"); } },
  { value: 'PENDING', get label() { return translate("admin:adminGuestImportsPage_choScheduler"); } },
  { value: 'RUNNING', get label() { return translate("admin:adminGuestImportsPage_dangXuLy"); } },
  { value: 'SUCCESS', get label() { return translate("admin:adminGuestImportsPage_thanhCong"); } },
  { value: 'PARTIAL', get label() { return translate("admin:adminGuestImportsPage_motPhan"); } },
  { value: 'FAILED', get label() { return translate("admin:adminGuestImportsPage_thatBai"); } },
  { value: 'SKIPPED', get label() { return translate("admin:adminGuestImportsPage_daBoQua"); } },
];

const sources: Array<{ value: '' | BatchLogSource; label: string }> = [
  { value: '', get label() { return translate("admin:adminGuestImportsPage_tatCaNguon"); } },
  { value: 'UPLOAD', get label() { return translate("admin:adminGuestImportsPage_taiLenThuCong"); } },
  { value: 'SCHEDULED', get label() { return translate("admin:adminGuestImportsPage_theoLich"); } },
];

const dateTime = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
});

function statusLabel(status: BatchLogStatus) {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

function sourceLabel(source: BatchLogSource | null) {
  return sources.find((item) => item.value === source)?.label ?? translate("admin:adminGuestImportsPage_khongXacDinh");
}

function duration(log: BatchLog) {
  if (!log.completedAt) return log.status === 'PENDING' ? translate("admin:adminGuestImportsPage_dangChoLichQuet") : translate("admin:adminGuestImportsPage_dangChay");
  const seconds = Math.max(
    0,
    Math.round((new Date(log.completedAt).getTime() - new Date(log.startedAt).getTime()) / 1000),
  );
  if (seconds < 60) return translate("admin:adminGuestImportsPage_giay", { arg1: seconds });
  return translate("admin:adminGuestImportsPage_phutGiay", { arg1: Math.floor(seconds / 60), arg2: seconds % 60 });
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
  useTranslation();
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
              : translate("admin:adminGuestImportsPage_khongTheTaiDanhSachConcert"),
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
            requestError instanceof Error ? requestError.message : translate("admin:adminGuestImportsPage_khongTheTaiLichSuImport"),
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
                      : translate("admin:adminGuestImportsPage_guestListUpdateFailed"),
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
              : translate("admin:adminGuestImportsPage_khongTheCapNhatTrangThaiImport"),
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
              : translate("admin:adminGuestImportsPage_khongTheCapNhatBatchGanNhat"),
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
      toast.error(translate("admin:adminGuestImportsPage_chiChapNhanFileCoDinhDang"));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (nextFile.size === 0) {
      setFile(null);
      toast.error(translate("admin:adminGuestImportsPage_fileCsvKhongDuocDeTrong"));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setFile(null);
      toast.error(translate("admin:adminGuestImportsPage_fileCsvKhongDuocVuotQua10"));
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
        scheduled ? translate("admin:adminGuestImportsPage_daXepFileCsvVaoHangCho") : translate("admin:adminGuestImportsPage_daTiepNhanFileCsvDeXu"),
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
                    : translate("admin:adminGuestImportsPage_guestListLoadFailed"),
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
            ? translate("admin:adminGuestImportsPage_fileDaDuocTiepNhanNhungChua", { arg1: detailError.message })
            : translate("admin:adminGuestImportsPage_fileDaDuocTiepNhanNhungChua_2"),
        );
      }
      await loadLogs(undefined, true);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : translate("admin:adminGuestImportsPage_khongTheTaiFileCsvLen"),
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
        requestError instanceof Error ? requestError.message : translate("admin:adminGuestImportsPage_khongTheTaiChiTietBatch"),
      );
    } finally {
      setDetailLoading(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={translate("admin:adminGuestImportsPage_vanHanhKhachMoi")}
        title={translate("admin:adminGuestImportsPage_importKhachMoi")}
        description={
          uploadMode === 'scheduled'
            ? translate("admin:adminGuestImportsPage_duaDanhSachCsvVaoHangCho")
            : translate("admin:adminGuestImportsPage_tiepNhanDanhSachCsvTheoDoi")
        }
        actions={
          safeReturnTo ? (
            <Link className="admin-secondary-action" to={safeReturnTo}>
              {translate("admin:adminGuestImportsPage_quayVeConcert")}
            </Link>
          ) : undefined
        }
      />

      <section className="guest-import-workspace">
        <form className="guest-upload-panel" onSubmit={submitUpload}>
          <div className="guest-section-heading">
            <div>
              <span>{uploadMode === 'scheduled' ? translate("admin:adminGuestImportsPage_importTheoLich") : translate("admin:adminGuestImportsPage_importThuCong")}</span>
              <h2>{translate("admin:adminGuestImportsPage_taiDanhSachMoi")}</h2>
            </div>
            <UploadCloud aria-hidden="true" size={22} />
          </div>
          <ConcertPicker
            concerts={concerts}
            value={uploadConcertId}
            onChange={setUploadConcertId}
            label={translate("admin:adminGuestImportsPage_concertNhanKhachMoi")}
            placeholder={loadingConcerts ? translate("admin:adminGuestImportsPage_dangTaiConcert") : translate("admin:adminGuestImportsPage_chonConcertNhanDanhSach")}
            disabled={loadingConcerts || uploading || !concerts.length}
          />
          <label className={`guest-file-picker ${file ? 'has-file' : ''}`}>
            <FileText aria-hidden="true" size={24} />
            <span>{file ? file.name : translate("admin:adminGuestImportsPage_chonFileCsv")}</span>
            <small>{file ? `${(file.size / 1024).toFixed(1)} KB` : translate("admin:adminGuestImportsPage_toiDa10Mb")}</small>
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
              ? translate("admin:adminGuestImportsPage_dangGuiFile")
              : uploadMode === 'scheduled'
                ? translate("admin:adminGuestImportsPage_duaVaoHangCho")
                : translate("admin:adminGuestImportsPage_batDauImport")}
          </button>
        </form>

        <div className="guest-latest-panel">
          <div className="guest-section-heading">
            <div>
              <span>{translate("admin:adminGuestImportsPage_tienTrinhGanNhat")}</span>
              <h2>{translate("admin:adminGuestImportsPage_trangThaiXuLy")}</h2>
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
              <p>{translate("admin:adminGuestImportsPage_batchVuaTaiLenSeXuatHien")}</p>
            </div>
          )}
        </div>
      </section>

      <section className="guest-log-section">
        <div className="guest-log-header">
          <div>
            <span>{translate("admin:adminGuestImportsPage_lichSuXuLy")}</span>
            <h2>{translate('batchImport')}</h2>
          </div>
          <button type="button" onClick={() => void loadLogs()} disabled={loadingLogs}>
            <RefreshCw aria-hidden="true" size={16} />
            {translate("admin:adminGuestImportsPage_lamMoi")}
          </button>
        </div>
        <div className="guest-log-filters">
          <label>
            <span>{translate('event')}</span>
            <select
              value={concertFilter}
              onChange={(event) => updateFilters({ concertId: event.target.value })}
            >
              <option value="">{translate("admin:adminGuestImportsPage_tatCaConcert")}</option>
              {concerts.map((concert) => (
                <option key={concert.id} value={concert.id}>
                  {concert.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{translate("admin:adminGuestImportsPage_trangThai")}</span>
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
            <span>{translate("admin:adminGuestImportsPage_nguon")}</span>
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
            {translate("admin:adminGuestImportsPage_xoaBoLoc")}
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
              aria-label={translate("admin:adminGuestImportsPage_dangTaiLichSuImport")}
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
                    <th>{translate("admin:adminGuestImportsPage_nguon")}</th>
                    <th>{translate("admin:adminGuestImportsPage_ketQua")}</th>
                    <th>{translate("admin:adminGuestImportsPage_batDau")}</th>
                    <th>
                      <span className="sr-only">{translate("admin:adminGuestImportsPage_thaoTac")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {logs.content.map((log) => (
                    <tr key={log.id}>
                      <td>
                        <strong className="admin-table-primary">
                          {log.fileName ?? translate("admin:adminGuestImportsPage_khongCoTenFile")}
                        </strong>
                        <span className="admin-table-secondary">{log.id.slice(0, 8)}</span>
                      </td>
                      <td>
                        <strong className="admin-table-primary">
                          {concertNames.get(log.concertId ?? '') ?? translate("admin:adminGuestImportsPage_concertKhongXacDinh")}
                        </strong>
                      </td>
                      <td>
                        <span className="guest-source-label">{sourceLabel(log.source)}</span>
                      </td>
                      <td>
                        <BatchStatus status={log.status} />
                        <span className="admin-table-secondary">
                          {log.successRows} {translate("admin:adminGuestImportsPage_thanhCong_2")} {log.errorRows} {translate("admin:adminGuestImportsPage_loi")}
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
                            aria-label={translate("admin:adminGuestImportsPage_xemChiTiet", { arg1: log.fileName ?? log.id })}
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
              <h2>{translate("admin:adminGuestImportsPage_chuaCoBatchPhuHop")}</h2>
              <p>{translate("admin:adminGuestImportsPage_thayDoiBoLocHoacTaiLen")}</p>
            </div>
          )}
        </div>

        {logs && logs.totalPages > 1 ? (
          <div className="admin-pagination">
            <span>
              {translate('pageNumber', { page: logs.number + 1, total: logs.totalPages })}
            </span>
            <div>
              <button
                type="button"
                aria-label={translate("admin:adminGuestImportsPage_trangTruoc")}
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
  useTranslation();
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
          aria-label={log.status === 'PENDING' ? translate("admin:adminGuestImportsPage_dangChoScheduler") : translate("admin:adminGuestImportsPage_dangXuLy")}
        >
          <span />
        </div>
      ) : null}
      <h3>{log.fileName ?? translate("admin:adminGuestImportsPage_danhSachKhachMoi")}</h3>
      <p>{concertName ?? translate("admin:adminGuestImportsPage_concertKhongXacDinh")}</p>
      <div className="guest-batch-counts">
        <span>
          <strong>{log.totalRows}</strong>{translate("admin:adminGuestImportsPage_tongDong")}
        </span>
        <span>
          <strong>{log.successRows}</strong>{translate("admin:adminGuestImportsPage_thanhCong")}
        </span>
        <span>
          <strong>{log.errorRows}</strong>{translate("admin:adminGuestImportsPage_loi_2")}
        </span>
      </div>
      <button type="button" onClick={onOpen}>
        {translate("admin:adminGuestImportsPage_xemChiTiet_2")} <Eye aria-hidden="true" size={15} />
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
            <span>{translate("admin:adminGuestImportsPage_chiTietBatch")}</span>
            <h2 id="batch-detail-title">{log.fileName ?? translate("admin:adminGuestImportsPage_chiTietImport")}</h2>
          </div>
          <button type="button" aria-label={translate("admin:adminGuestImportsPage_dong")} onClick={onClose} autoFocus>
            <X size={20} />
          </button>
        </header>
        <div className="batch-detail-body">
          {loading ? (
            <div className="batch-detail-loading">{translate("admin:adminGuestImportsPage_dangTaiDuLieuMoiNhat")}</div>
          ) : null}
          <div className="batch-detail-lead">
            <BatchStatus status={log.status} />
            <strong>{concertName ?? translate("admin:adminGuestImportsPage_concertKhongXacDinh")}</strong>
            <span>{sourceLabel(log.source)}</span>
          </div>
          {isActiveBatch(log.status) ? (
            <div
              className="guest-indeterminate"
              aria-label={log.status === 'PENDING' ? translate("admin:adminGuestImportsPage_dangChoScheduler") : translate("admin:adminGuestImportsPage_dangXuLy")}
            >
              <span />
            </div>
          ) : null}
          <dl className="batch-detail-counts">
            <div>
              <dt>{translate("admin:adminGuestImportsPage_tongDong")}</dt>
              <dd>{log.totalRows}</dd>
            </div>
            <div>
              <dt>{translate("admin:adminGuestImportsPage_thanhCong")}</dt>
              <dd>{log.successRows}</dd>
            </div>
            <div>
              <dt>{translate("admin:adminGuestImportsPage_loi_2")}</dt>
              <dd>{log.errorRows}</dd>
            </div>
          </dl>
          <dl className="batch-detail-meta">
            <div>
              <dt>{translate("admin:adminGuestImportsPage_batDau")}</dt>
              <dd>{dateTime.format(new Date(log.startedAt))}</dd>
            </div>
            <div>
              <dt>{translate("admin:adminGuestImportsPage_hoanTat")}</dt>
              <dd>{log.completedAt ? dateTime.format(new Date(log.completedAt)) : translate("admin:adminGuestImportsPage_dangXuLy")}</dd>
            </div>
            <div>
              <dt>{translate("admin:adminGuestImportsPage_thoiLuong")}</dt>
              <dd>{duration(log)}</dd>
            </div>
            {showTechnicalDetails ? (
              <div>
                <dt>{translate('checksum')}</dt>
                <dd>
                  <code>{log.checksum ?? translate("admin:adminGuestImportsPage_khongCo")}</code>
                </dd>
              </div>
            ) : null}
            {showTechnicalDetails ? (
              <div>
                <dt>{translate("admin:adminGuestImportsPage_fileLuuTru")}</dt>
                <dd>
                  <code>{log.filePath ?? translate("admin:adminGuestImportsPage_khongCo")}</code>
                </dd>
              </div>
            ) : null}
            <div>
              <dt>{translate("admin:adminGuestImportsPage_baoCaoLoi")}</dt>
              <dd>
                <code>{log.errorReportPath ?? translate("admin:adminGuestImportsPage_khongCo")}</code>
              </dd>
            </div>
          </dl>
          {log.errorDetail ? (
            <div className="batch-error-detail">
              <span>{translate("admin:adminGuestImportsPage_chiTietLoi")}</span>
              <p>{log.errorDetail}</p>
            </div>
          ) : null}
          <section className="batch-guest-preview">
            <div className="batch-guest-preview-heading">
              <div>
                <span>{translate("admin:adminGuestImportsPage_danhSachKhachMoi")}</span>
                <h3>{translate("admin:adminGuestImportsPage_danhSachKhachMoiCuaConcert")}</h3>
              </div>
              <strong>{guests.length} {translate("admin:adminGuestImportsPage_khach")}</strong>
            </div>
            {guests.length ? (
              <div className="admin-table-wrap">
                <table className="admin-table">
                  <thead>
                    <tr>
                      <th>{translate("admin:adminGuestImportsPage_khachMoi")}</th>
                      <th>{translate("admin:adminGuestImportsPage_hang")}</th>
                      <th>{translate('sponsor')}</th>
                      <th>{translate("admin:adminGuestImportsPage_trangThai")}</th>
                      <th>{translate("admin:adminGuestImportsPage_checkIn")}</th>
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
                            {guest.active ? translate("admin:adminGuestImportsPage_hieuLuc") : translate("admin:adminGuestImportsPage_daHuy")}
                          </span>
                        </td>
                        <td>
                          {guest.checkedInAt
                            ? dateTime.format(new Date(guest.checkedInAt))
                            : translate("admin:adminGuestImportsPage_chuaVao")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="admin-empty-state compact">
                <FileText aria-hidden="true" size={22} />
                <h2>{translate("admin:adminGuestImportsPage_chuaCoKhachMoi")}</h2>
                <p>{translate("admin:adminGuestImportsPage_batchCoTheDangXuLyHoac")}</p>
              </div>
            )}
          </section>
        </div>
      </section>
      </div>
    </ModalPortal>
  );
}
