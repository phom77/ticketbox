import { dateFormatter } from '../../data/formatters';
import { translate, formatLanguage } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileText,
  RefreshCw,
  RotateCcw,
  RotateCw,
  Sparkles,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  deleteArtistBioJob,
  getAdminConcerts,
  getArtistBioJob,
  getArtistBioJobs,
  retryArtistBioJob,
  submitArtistBioJob,
  type ArtistBioJob,
  type ArtistBioJobStatus,
  type ManagementApiScope,
} from '../../api/admin';
import type { ConcertDetail, Page } from '../../api/concerts';
import { isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ConcertPicker } from '../../components/admin/ConcertPicker';
import { useToast } from '../../components/feedback/toast-context';
import { ModalPortal } from '../../components/feedback/ModalPortal';

const statuses: Array<{ value: '' | ArtistBioJobStatus; label: string }> = [
  { value: '', get label() { return translate("admin:adminArtistBioPage_tatCaTrangThai"); } },
  { value: 'PENDING', get label() { return translate("admin:adminArtistBioPage_dangCho"); } },
  { value: 'PROCESSING', get label() { return translate("admin:adminArtistBioPage_dangTaoBio"); } },
  { value: 'DONE', get label() { return translate("admin:adminArtistBioPage_sanSangRaSoat"); } },
  { value: 'FAILED', get label() { return translate("admin:adminArtistBioPage_thatBai"); } },
];

const dateTime = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
});

function isActive(status: ArtistBioJobStatus) {
  return status === 'PENDING' || status === 'PROCESSING';
}

function statusLabel(status: ArtistBioJobStatus) {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

function duration(job: ArtistBioJob) {
  if (!job.startedAt) return translate("admin:adminArtistBioPage_chuaBatDau");
  if (!job.completedAt) return translate("admin:adminArtistBioPage_dangXuLy");
  const seconds = Math.max(
    0,
    Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000),
  );
  return seconds < 60 ? translate("admin:adminArtistBioPage_giay", { arg1: seconds }) : translate("admin:adminArtistBioPage_phutGiay", { arg1: Math.floor(seconds / 60), arg2: seconds % 60 });
}

export function AdminArtistBioPage({ apiScope = 'admin' }: { apiScope?: ManagementApiScope }) {
  useTranslation();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const root = apiScope === 'admin' ? '/admin' : '/organizer';
  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo?.startsWith(`${root}/concerts/`) ? returnTo : '';
  const [concerts, setConcerts] = useState<ConcertDetail[]>([]);
  const [jobs, setJobs] = useState<Page<ArtistBioJob> | null>(null);
  const [loadingConcerts, setLoadingConcerts] = useState(true);
  const [loadingJobs, setLoadingJobs] = useState(true);
  const [jobsError, setJobsError] = useState('');
  const [uploadConcertId, setUploadConcertId] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [latestJob, setLatestJob] = useState<ArtistBioJob | null>(null);
  const [selectedJob, setSelectedJob] = useState<ArtistBioJob | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retrying, setRetrying] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const page = Math.max(0, Math.floor(Number(searchParams.get('page')) || 0));
  const concertFilter = searchParams.get('concertId') ?? '';
  const statusValue = searchParams.get('status') ?? '';
  const statusFilter = statuses.some((item) => item.value === statusValue)
    ? (statusValue as '' | ArtistBioJobStatus)
    : '';

  const loadConcerts = useCallback(
    async (signal?: AbortSignal) => {
      setLoadingConcerts(true);
      try {
        const data = await getAdminConcerts(0, 100, undefined, signal, apiScope);
        setConcerts(data.content);
        setUploadConcertId((current) => current || concertFilter || data.content[0]?.id || '');
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : translate("admin:adminArtistBioPage_khongTheTaiDanhSachConcert"),
          );
        }
      } finally {
        if (!signal?.aborted) setLoadingConcerts(false);
      }
    },
    [apiScope, concertFilter, toast],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadConcerts(controller.signal);
    return () => controller.abort();
  }, [loadConcerts]);

  const loadJobs = useCallback(
    async (signal?: AbortSignal, silent = false) => {
      if (!silent) setLoadingJobs(true);
      setJobsError('');
      try {
        setJobs(
          await getArtistBioJobs(
            {
              page,
              size: 20,
              concertId: concertFilter || undefined,
              status: statusFilter || undefined,
            },
            signal,
            apiScope,
          ),
        );
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          setJobsError(
            requestError instanceof Error
              ? requestError.message
              : translate("admin:adminArtistBioPage_khongTheTaiLichSuGioiThieu"),
          );
        }
      } finally {
        if (!signal?.aborted && !silent) setLoadingJobs(false);
      }
    },
    [apiScope, concertFilter, page, statusFilter],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadJobs(controller.signal);
    return () => controller.abort();
  }, [loadJobs]);

  const hasActiveJob = jobs?.content.some((job) => isActive(job.status)) ?? false;
  useEffect(() => {
    if (!hasActiveJob) return;
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') void loadJobs(undefined, true);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [hasActiveJob, loadJobs]);

  useEffect(() => {
    if (!selectedJob || !isActive(selectedJob.status)) return;
    const controller = new AbortController();
    let requestInFlight = false;
    const timer = window.setInterval(async () => {
      if (requestInFlight || document.visibilityState !== 'visible') return;
      requestInFlight = true;
      try {
        const updated = await getArtistBioJob(selectedJob.id, controller.signal, apiScope);
        setSelectedJob(updated);
        setLatestJob((current) => (current?.id === updated.id ? updated : current));
        if (!isActive(updated.status)) void loadJobs(undefined, true);
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          toast.error(
            requestError instanceof Error ? requestError.message : translate("admin:adminArtistBioPage_khongTheCapNhatTacVuAi"),
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
  }, [apiScope, loadJobs, selectedJob, toast]);

  useEffect(() => {
    if (!latestJob || !isActive(latestJob.status) || selectedJob?.id === latestJob.id) return;
    const controller = new AbortController();
    let requestInFlight = false;
    const timer = window.setInterval(async () => {
      if (requestInFlight || document.visibilityState !== 'visible') return;
      requestInFlight = true;
      try {
        const updated = await getArtistBioJob(latestJob.id, controller.signal, apiScope);
        setLatestJob(updated);
        if (!isActive(updated.status)) void loadJobs(undefined, true);
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : translate("admin:adminArtistBioPage_khongTheCapNhatTacVuGan"),
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
  }, [apiScope, latestJob, loadJobs, selectedJob?.id, toast]);

  const concertMap = useMemo(
    () => new Map(concerts.map((concert) => [concert.id, concert])),
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
    if (!nextFile.name.toLowerCase().endsWith('.pdf')) {
      setFile(null);
      toast.error(translate("admin:adminArtistBioPage_chiChapNhanFilePdf"));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (nextFile.size === 0) {
      setFile(null);
      toast.error(translate("admin:adminArtistBioPage_filePdfKhongDuocDeTrong"));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setFile(null);
      toast.error(translate("admin:adminArtistBioPage_filePdfKhongDuocVuotQua10"));
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    setFile(nextFile);
  }

  async function submitJob(event: FormEvent) {
    event.preventDefault();
    if (!file || !uploadConcertId) return;
    setUploading(true);
    try {
      const result = await submitArtistBioJob(uploadConcertId, file, apiScope);
      toast.success(translate("admin:adminArtistBioPage_daTiepNhanPdfDeTaoGioi"));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      try {
        const detail = await getArtistBioJob(result.data.jobId, undefined, apiScope);
        setLatestJob(detail);
        setSelectedJob(detail);
      } catch (detailError) {
        toast.error(
          detailError instanceof Error
            ? translate("admin:adminArtistBioPage_tacVuDaDuocTaoNhungChua", { arg1: detailError.message })
            : translate("admin:adminArtistBioPage_tacVuDaDuocTaoNhungChua_2"),
        );
      }
      await loadJobs(undefined, true);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : translate("admin:adminArtistBioPage_khongTheTaiPdfLen"));
    } finally {
      setUploading(false);
    }
  }

  async function openDetail(job: ArtistBioJob) {
    setSelectedJob(job);
    setDetailLoading(true);
    try {
      setSelectedJob(await getArtistBioJob(job.id, undefined, apiScope));
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : translate("admin:adminArtistBioPage_khongTheTaiChiTietTacVu"),
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function retryJob(job: ArtistBioJob) {
    setRetrying(true);
    try {
      const result = await retryArtistBioJob(job.id, apiScope);
      toast.success(translate("admin:adminArtistBioPage_daDuaTacVuVaoHangCho"));
      const updated = await getArtistBioJob(result.data.jobId, undefined, apiScope);
      setSelectedJob(updated);
      setLatestJob(updated);
      await loadJobs(undefined, true);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : translate("admin:adminArtistBioPage_khongTheThuLaiTacVuAi"),
      );
    } finally {
      setRetrying(false);
    }
  }

  async function deleteJob(job: ArtistBioJob) {
    if (!window.confirm(translate("admin:adminArtistBioPage_xoaBanNhap", { arg1: job.originalFileName }))) return;
    setDeletingId(job.id);
    try {
      await deleteArtistBioJob(job.id, apiScope);
      toast.success(translate("admin:adminArtistBioPage_daXoaBanNhapAi"));
      if (selectedJob?.id === job.id) setSelectedJob(null);
      if (latestJob?.id === job.id) setLatestJob(null);
      await loadJobs(undefined, true);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : translate("admin:adminArtistBioPage_khongTheXoaBanNhapAi"),
      );
    } finally {
      setDeletingId('');
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={translate("admin:adminArtistBioPage_bienTapAi")}
        title={translate("admin:adminArtistBioPage_gioiThieuNgheSiBangAi")}
        description={translate("admin:adminArtistBioPage_taoBanGioiThieuNgheSiTu")}
        actions={
          safeReturnTo ? (
            <Link className="admin-secondary-action" to={safeReturnTo}>
              {translate("admin:adminArtistBioPage_quayVeConcert")}
            </Link>
          ) : undefined
        }
      />

      <section className="ai-bio-workspace">
        <form className="ai-bio-upload" onSubmit={submitJob}>
          <ToolHeading
            eyebrow={translate("admin:adminArtistBioPage_taoNoiDung")}
            title={translate("admin:adminArtistBioPage_hoSoBaoChiMoi")}
            icon={<Sparkles size={22} />}
          />
          <ConcertPicker
            concerts={concerts}
            value={uploadConcertId}
            onChange={setUploadConcertId}
            label={translate("admin:adminArtistBioPage_concertNhanNoiDung")}
            placeholder={loadingConcerts ? translate("admin:adminArtistBioPage_dangTaiConcert") : translate("admin:adminArtistBioPage_chonConcertChoHoSoBaoChi")}
            disabled={loadingConcerts || uploading || !concerts.length}
          />
          <label className={`ai-pdf-picker ${file ? 'has-file' : ''}`}>
            <FileText aria-hidden="true" size={25} />
            <span>{file ? file.name : translate("admin:adminArtistBioPage_chonHoSoBaoChiPdf")}</span>
            <small>
              {file
                ? `${(file.size / 1024).toFixed(1)} KB`
                : translate("admin:adminArtistBioPage_pdfCoTextToiDa10Mb")}
            </small>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,application/pdf"
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
            {uploading ? translate("admin:adminArtistBioPage_dangGuiPdf") : translate("admin:adminArtistBioPage_taoGioiThieuNgheSi")}
          </button>
        </form>

        <div className="ai-bio-latest">
          <ToolHeading
            eyebrow={translate("admin:adminArtistBioPage_tacVuGanNhat")}
            title={translate("admin:adminArtistBioPage_trangThaiAi")}
            icon={<RefreshCw size={21} />}
          />
          {latestJob ? (
            <JobSnapshot
              job={latestJob}
              concertTitle={concertMap.get(latestJob.concertId)?.title}
              onOpen={() => void openDetail(latestJob)}
            />
          ) : (
            <div className="ai-latest-empty">
              <p>{translate("admin:adminArtistBioPage_tacVuVuaTaoSeXuatHien")}</p>
            </div>
          )}
        </div>
      </section>

      <section className="ai-history-section">
        <div className="guest-log-header">
          <div>
            <span>{translate("admin:adminArtistBioPage_lichSuBienTap")}</span>
            <h2>{translate("admin:adminArtistBioPage_tacVuGioiThieuNgheSi")}</h2>
          </div>
          <button type="button" onClick={() => void loadJobs()} disabled={loadingJobs}>
            <RefreshCw aria-hidden="true" size={16} />
            {translate("admin:adminArtistBioPage_lamMoi")}
          </button>
        </div>
        <div className="ai-job-filters">
          <label>
            <span>{translate('event')}</span>
            <select
              value={concertFilter}
              onChange={(event) => updateFilters({ concertId: event.target.value })}
            >
              <option value="">{translate("admin:adminArtistBioPage_tatCaConcert")}</option>
              {concerts.map((concert) => (
                <option key={concert.id} value={concert.id}>
                  {concert.title}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span>{translate("admin:adminArtistBioPage_trangThai")}</span>
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
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            disabled={!concertFilter && !statusFilter && page === 0}
          >
            <RotateCcw aria-hidden="true" size={15} />
            {translate("admin:adminArtistBioPage_xoaBoLoc")}
          </button>
        </div>
        {jobsError ? (
          <div className="admin-notice error" role="alert">
            {jobsError}
          </div>
        ) : null}
        <div className="admin-data-panel">
          {loadingJobs ? (
            <div className="admin-row-skeleton" aria-label={translate("admin:adminArtistBioPage_dangTaiTacVuAi")} aria-live="polite">
              {[1, 2, 3, 4].map((item) => (
                <span key={item} />
              ))}
            </div>
          ) : jobs?.content.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table ai-job-table">
                <thead>
                  <tr>
                    <th>{translate("admin:adminArtistBioPage_pdf")}</th>
                    <th>{translate('event')}</th>
                    <th>{translate("admin:adminArtistBioPage_trangThai")}</th>
                    <th>{translate("admin:adminArtistBioPage_nhaCungCap")}</th>
                    <th>{translate("admin:adminArtistBioPage_thoiGian")}</th>
                    <th>
                      <span className="sr-only">{translate("admin:adminArtistBioPage_thaoTac")}</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {jobs.content.map((job) => (
                    <tr key={job.id}>
                      <td>
                        <strong className="admin-table-primary">{job.originalFileName}</strong>
                        <span className="admin-table-secondary">
                          {job.extractedCharCount == null
                            ? job.id.slice(0, 8)
                            : translate("admin:adminArtistBioPage_kyTu", { arg1: job.extractedCharCount.toLocaleString(formatLanguage()) })}
                        </span>
                      </td>
                      <td>
                        <strong className="admin-table-primary">
                          {concertMap.get(job.concertId)?.title ?? translate("admin:adminArtistBioPage_concertKhongXacDinh")}
                        </strong>
                      </td>
                      <td>
                        <ArtistJobStatus status={job.status} />
                        {job.appliedAt ? (
                          <span className="ai-applied-label">
                            <Check size={12} />
                            {translate("admin:adminArtistBioPage_daApDung")}
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <strong className="admin-table-primary">
                          {job.provider ?? translate("admin:adminArtistBioPage_chuaXacDinh")}
                        </strong>
                        <span className="admin-table-secondary">
                          {job.model ?? translate("admin:adminArtistBioPage_dangChoModel")}
                        </span>
                      </td>
                      <td>
                        <strong className="admin-table-primary">
                          {dateTime.format(new Date(job.createdAt))}
                        </strong>
                        <span className="admin-table-secondary">{duration(job)}</span>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            aria-label={translate("admin:adminArtistBioPage_raSoat", { arg1: job.originalFileName })}
                            onClick={() => void openDetail(job)}
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={translate("admin:adminArtistBioPage_xoa", { arg1: job.originalFileName })}
                            disabled={deletingId === job.id}
                            onClick={() => void deleteJob(job)}
                          >
                            <Trash2 size={16} />
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
              <Sparkles aria-hidden="true" size={28} />
              <h2>{translate("admin:adminArtistBioPage_chuaCoTacVuAiPhuHop")}</h2>
              <p>{translate("admin:adminArtistBioPage_thayDoiBoLocHoacTaiHo")}</p>
            </div>
          )}
        </div>
        {jobs && jobs.totalPages > 1 ? (
          <div className="admin-pagination">
            <span>
              {translate('pageNumber', { page: jobs.number + 1, total: jobs.totalPages })}
            </span>
            <div>
              <button
                type="button"
                aria-label={translate("admin:adminArtistBioPage_trangTruoc")}
                disabled={jobs.first}
                onClick={() => updateFilters({ page: String(page - 1) })}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                aria-label={translate('pageNext')}
                disabled={jobs.last}
                onClick={() => updateFilters({ page: String(page + 1) })}
              >
                <ChevronRight size={17} />
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {selectedJob ? (
        <ArtistBioReviewDialog
          job={selectedJob}
          concert={concertMap.get(selectedJob.concertId)}
          loading={detailLoading}
          retrying={retrying}
          onRetry={() => void retryJob(selectedJob)}
          onClose={() => setSelectedJob(null)}
        />
      ) : null}
    </>
  );
}

function ToolHeading({
  eyebrow,
  title,
  icon,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
}) {
  useTranslation();
  return (
    <div className="guest-section-heading">
      <div>
        <span>{eyebrow}</span>
        <h2>{title}</h2>
      </div>
      {icon}
    </div>
  );
}

function ArtistJobStatus({ status }: { status: ArtistBioJobStatus }) {
  useTranslation();
  return (
    <span className={`ai-job-status ai-status-${status.toLowerCase()}`}>
      {isActive(status) ? <i aria-hidden="true" /> : null}
      {statusLabel(status)}
    </span>
  );
}

function JobSnapshot({
  job,
  concertTitle,
  onOpen,
}: {
  job: ArtistBioJob;
  concertTitle?: string;
  onOpen: () => void;
}) {
  useTranslation();
  return (
    <div className="ai-job-snapshot">
      <div>
        <ArtistJobStatus status={job.status} />
        {job.appliedAt ? (
          <span className="ai-applied-label">
            <Check size={12} />
            {translate("admin:adminArtistBioPage_daApDung")}
          </span>
        ) : null}
      </div>
      {isActive(job.status) ? (
        <div className="guest-indeterminate" aria-label={translate("admin:adminArtistBioPage_aiDangXuLy")}>
          <span />
        </div>
      ) : null}
      <h3>{job.originalFileName}</h3>
      <p>{concertTitle ?? translate("admin:adminArtistBioPage_concertKhongXacDinh")}</p>
      <dl>
        <div>
          <dt>{translate("admin:adminArtistBioPage_nhaCungCap")}</dt>
          <dd>{job.provider ?? translate("admin:adminArtistBioPage_dangCho")}</dd>
        </div>
        <div>
          <dt>{translate("admin:adminArtistBioPage_kyTuNguon")}</dt>
          <dd>{job.extractedCharCount?.toLocaleString(formatLanguage()) ?? '—'}</dd>
        </div>
        <div>
          <dt>{translate("admin:adminArtistBioPage_thoiLuong")}</dt>
          <dd>{duration(job)}</dd>
        </div>
      </dl>
      {job.errorMessage ? <div className="ai-snapshot-error">{job.errorMessage}</div> : null}
      <button type="button" onClick={onOpen}>
        {job.status === 'DONE' ? translate("admin:adminArtistBioPage_raSoatNoiDung") : translate("admin:adminArtistBioPage_xemChiTiet")} <Eye size={15} />
      </button>
    </div>
  );
}

function ArtistBioReviewDialog({
  job,
  concert,
  loading,
  retrying,
  onRetry,
  onClose,
}: {
  job: ArtistBioJob;
  concert?: ConcertDetail;
  loading: boolean;
  retrying: boolean;
  onRetry: () => void;
  onClose: () => void;
}) {
  useTranslation();
  const busy = retrying;
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !busy) onClose();
    }
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [busy, onClose]);

  return (
    <ModalPortal>
      <div
        className="admin-dialog-backdrop"
        role="presentation"
        onMouseDown={(event) => {
          if (event.target === event.currentTarget && !busy) onClose();
        }}
      >
      <section
        className="admin-dialog ai-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ai-review-title"
      >
        <header>
          <div>
            <span>{translate("admin:adminArtistBioPage_raSoatGioiThieuNgheSi")}</span>
            <h2 id="ai-review-title">{concert?.title ?? job.originalFileName}</h2>
          </div>
          <button type="button" aria-label={translate("admin:adminArtistBioPage_dong")} onClick={onClose} disabled={busy} autoFocus>
            <X size={20} />
          </button>
        </header>
        <div className="ai-review-body">
          {loading ? <div className="batch-detail-loading">{translate("admin:adminArtistBioPage_dangTaiTacVuMoiNhat")}</div> : null}
          <div className="ai-review-meta">
            <ArtistJobStatus status={job.status} />
            <span>{job.originalFileName}</span>
            <span>
              {job.provider ?? translate("admin:adminArtistBioPage_chuaCoNhaCungCap")} · {job.model ?? translate("admin:adminArtistBioPage_chuaCoModel")}
            </span>
          </div>
          {isActive(job.status) ? (
            <div className="guest-indeterminate" aria-label={translate("admin:adminArtistBioPage_aiDangXuLy")}>
              <span />
            </div>
          ) : null}
          <dl className="ai-review-facts">
            <div>
              <dt>{translate("admin:adminArtistBioPage_taoLuc")}</dt>
              <dd>{dateTime.format(new Date(job.createdAt))}</dd>
            </div>
            <div>
              <dt>{translate("admin:adminArtistBioPage_thoiLuong")}</dt>
              <dd>{duration(job)}</dd>
            </div>
            <div>
              <dt>{translate("admin:adminArtistBioPage_kyTuTrichXuat")}</dt>
              <dd>{job.extractedCharCount?.toLocaleString(formatLanguage()) ?? translate("admin:adminArtistBioPage_chuaCo")}</dd>
            </div>
            <div>
              <dt>{translate("admin:adminArtistBioPage_xuatBan")}</dt>
              <dd>
                {job.appliedAt
                  ? dateTime.format(new Date(job.appliedAt))
                  : translate("admin:adminArtistBioPage_canBienTapTrongKhongGianConcert")}
              </dd>
            </div>
          </dl>
          {job.resultBio ? (
            <article className="ai-bio-draft">
              <span>{translate("admin:adminArtistBioPage_banNhapDoAiTao")}</span>
              <p>{job.resultBio}</p>
            </article>
          ) : null}
          {job.errorMessage ? (
            <div className="batch-error-detail">
              <span>{translate("admin:adminArtistBioPage_tacVuThatBai")}</span>
              <p>{job.errorMessage}</p>
            </div>
          ) : null}
        </div>
        <footer className="ai-review-actions">
          <button
            className="admin-secondary-action"
            type="button"
            onClick={onClose}
            disabled={busy}
          >
            {translate("admin:adminArtistBioPage_dong")}
          </button>
          {job.status === 'FAILED' ? (
            <button
              className="admin-primary-action"
              type="button"
              onClick={onRetry}
              disabled={busy}
            >
              <RotateCw size={16} />
              {retrying ? translate("admin:adminArtistBioPage_dangThuLai") : translate("admin:adminArtistBioPage_thuLaiTacVu")}
            </button>
          ) : null}
        </footer>
      </section>
      </div>
    </ModalPortal>
  );
}
