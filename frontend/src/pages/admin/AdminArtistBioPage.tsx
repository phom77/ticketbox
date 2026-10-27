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
import { commandMessage, isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ConcertPicker } from '../../components/admin/ConcertPicker';
import { useToast } from '../../components/feedback/toast-context';
import { ModalPortal } from '../../components/feedback/ModalPortal';

const statuses: Array<{ value: '' | ArtistBioJobStatus; label: string }> = [
  { value: '', label: 'Tất cả trạng thái' },
  { value: 'PENDING', label: 'Đang chờ' },
  { value: 'PROCESSING', label: 'Đang tạo bio' },
  { value: 'DONE', label: 'Sẵn sàng rà soát' },
  { value: 'FAILED', label: 'Thất bại' },
];

const dateTime = new Intl.DateTimeFormat('vi-VN', {
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
  if (!job.startedAt) return 'Chưa bắt đầu';
  if (!job.completedAt) return 'Đang xử lý';
  const seconds = Math.max(
    0,
    Math.round((new Date(job.completedAt).getTime() - new Date(job.startedAt).getTime()) / 1000),
  );
  return seconds < 60 ? `${seconds} giây` : `${Math.floor(seconds / 60)} phút ${seconds % 60} giây`;
}

export function AdminArtistBioPage({ apiScope = 'admin' }: { apiScope?: ManagementApiScope }) {
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
              : 'Không thể tải danh sách concert.',
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
              : 'Không thể tải lịch sử giới thiệu nghệ sĩ bằng AI.',
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
            requestError instanceof Error ? requestError.message : 'Không thể cập nhật tác vụ AI.',
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
              : 'Không thể cập nhật tác vụ gần nhất.',
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
      toast.error('Chỉ chấp nhận file PDF.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (nextFile.size === 0) {
      setFile(null);
      toast.error('File PDF không được để trống.');
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }
    if (nextFile.size > 10 * 1024 * 1024) {
      setFile(null);
      toast.error('File PDF không được vượt quá 10 MB.');
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
      toast.success(commandMessage(result.message, 'Đã tiếp nhận PDF để tạo giới thiệu nghệ sĩ.'));
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      try {
        const detail = await getArtistBioJob(result.data.jobId, undefined, apiScope);
        setLatestJob(detail);
        setSelectedJob(detail);
      } catch (detailError) {
        toast.error(
          detailError instanceof Error
            ? `Tác vụ đã được tạo nhưng chưa tải được trạng thái: ${detailError.message}`
            : 'Tác vụ đã được tạo nhưng chưa tải được trạng thái.',
        );
      }
      await loadJobs(undefined, true);
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Không thể tải PDF lên.');
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
        requestError instanceof Error ? requestError.message : 'Không thể tải chi tiết tác vụ AI.',
      );
    } finally {
      setDetailLoading(false);
    }
  }

  async function retryJob(job: ArtistBioJob) {
    setRetrying(true);
    try {
      const result = await retryArtistBioJob(job.id, apiScope);
      toast.success(commandMessage(result.message, 'Đã đưa tác vụ vào hàng chờ xử lý lại.'));
      const updated = await getArtistBioJob(result.data.jobId, undefined, apiScope);
      setSelectedJob(updated);
      setLatestJob(updated);
      await loadJobs(undefined, true);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'Không thể thử lại tác vụ AI.',
      );
    } finally {
      setRetrying(false);
    }
  }

  async function deleteJob(job: ArtistBioJob) {
    if (!window.confirm(`Xóa bản nháp "${job.originalFileName}"?`)) return;
    setDeletingId(job.id);
    try {
      await deleteArtistBioJob(job.id, apiScope);
      toast.success('Đã xóa bản nháp AI.');
      if (selectedJob?.id === job.id) setSelectedJob(null);
      if (latestJob?.id === job.id) setLatestJob(null);
      await loadJobs(undefined, true);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'Không thể xóa bản nháp AI.',
      );
    } finally {
      setDeletingId('');
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Biên tập AI"
        title="Giới thiệu nghệ sĩ bằng AI"
        description="Tạo bản giới thiệu nghệ sĩ từ hồ sơ báo chí PDF, rà soát nội dung và chủ động xuất bản lên trang concert."
        actions={
          safeReturnTo ? (
            <Link className="admin-secondary-action" to={safeReturnTo}>
              Quay về concert
            </Link>
          ) : undefined
        }
      />

      <section className="ai-bio-workspace">
        <form className="ai-bio-upload" onSubmit={submitJob}>
          <ToolHeading
            eyebrow="Tạo nội dung"
            title="Hồ sơ báo chí mới"
            icon={<Sparkles size={22} />}
          />
          <ConcertPicker
            concerts={concerts}
            value={uploadConcertId}
            onChange={setUploadConcertId}
            label="Concert nhận nội dung"
            placeholder={loadingConcerts ? 'Đang tải concert...' : 'Chọn concert cho hồ sơ báo chí'}
            disabled={loadingConcerts || uploading || !concerts.length}
          />
          <label className={`ai-pdf-picker ${file ? 'has-file' : ''}`}>
            <FileText aria-hidden="true" size={25} />
            <span>{file ? file.name : 'Chọn hồ sơ báo chí PDF'}</span>
            <small>
              {file
                ? `${(file.size / 1024).toFixed(1)} KB`
                : 'PDF có text · tối đa 10 MB · 50 trang'}
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
            {uploading ? 'Đang gửi PDF...' : 'Tạo giới thiệu nghệ sĩ'}
          </button>
        </form>

        <div className="ai-bio-latest">
          <ToolHeading
            eyebrow="Tác vụ gần nhất"
            title="Trạng thái AI"
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
              <p>Tác vụ vừa tạo sẽ xuất hiện tại đây để bạn theo dõi.</p>
            </div>
          )}
        </div>
      </section>

      <section className="ai-history-section">
        <div className="guest-log-header">
          <div>
            <span>Lịch sử biên tập</span>
            <h2>Tác vụ giới thiệu nghệ sĩ</h2>
          </div>
          <button type="button" onClick={() => void loadJobs()} disabled={loadingJobs}>
            <RefreshCw aria-hidden="true" size={16} />
            Làm mới
          </button>
        </div>
        <div className="ai-job-filters">
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
          <button
            type="button"
            onClick={() => setSearchParams({}, { replace: true })}
            disabled={!concertFilter && !statusFilter && page === 0}
          >
            <RotateCcw aria-hidden="true" size={15} />
            Xóa bộ lọc
          </button>
        </div>
        {jobsError ? (
          <div className="admin-notice error" role="alert">
            {jobsError}
          </div>
        ) : null}
        <div className="admin-data-panel">
          {loadingJobs ? (
            <div className="admin-row-skeleton" aria-label="Đang tải tác vụ AI" aria-live="polite">
              {[1, 2, 3, 4].map((item) => (
                <span key={item} />
              ))}
            </div>
          ) : jobs?.content.length ? (
            <div className="admin-table-wrap">
              <table className="admin-table ai-job-table">
                <thead>
                  <tr>
                    <th>PDF</th>
                    <th>Concert</th>
                    <th>Trạng thái</th>
                    <th>Nhà cung cấp</th>
                    <th>Thời gian</th>
                    <th>
                      <span className="sr-only">Thao tác</span>
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
                            : `${job.extractedCharCount.toLocaleString('vi-VN')} ký tự`}
                        </span>
                      </td>
                      <td>
                        <strong className="admin-table-primary">
                          {concertMap.get(job.concertId)?.title ?? 'Concert không xác định'}
                        </strong>
                      </td>
                      <td>
                        <ArtistJobStatus status={job.status} />
                        {job.appliedAt ? (
                          <span className="ai-applied-label">
                            <Check size={12} />
                            Đã áp dụng
                          </span>
                        ) : null}
                      </td>
                      <td>
                        <strong className="admin-table-primary">
                          {job.provider ?? 'Chưa xác định'}
                        </strong>
                        <span className="admin-table-secondary">
                          {job.model ?? 'Đang chờ model'}
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
                            aria-label={`Rà soát ${job.originalFileName}`}
                            onClick={() => void openDetail(job)}
                          >
                            <Eye size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Xóa ${job.originalFileName}`}
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
              <h2>Chưa có tác vụ AI phù hợp</h2>
              <p>Thay đổi bộ lọc hoặc tải hồ sơ báo chí đầu tiên để tạo giới thiệu nghệ sĩ.</p>
            </div>
          )}
        </div>
        {jobs && jobs.totalPages > 1 ? (
          <div className="admin-pagination">
            <span>
              Trang {jobs.number + 1} / {jobs.totalPages}
            </span>
            <div>
              <button
                type="button"
                aria-label="Trang trước"
                disabled={jobs.first}
                onClick={() => updateFilters({ page: String(page - 1) })}
              >
                <ChevronLeft size={17} />
              </button>
              <button
                type="button"
                aria-label="Trang sau"
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
  return (
    <div className="ai-job-snapshot">
      <div>
        <ArtistJobStatus status={job.status} />
        {job.appliedAt ? (
          <span className="ai-applied-label">
            <Check size={12} />
            Đã áp dụng
          </span>
        ) : null}
      </div>
      {isActive(job.status) ? (
        <div className="guest-indeterminate" aria-label="AI đang xử lý">
          <span />
        </div>
      ) : null}
      <h3>{job.originalFileName}</h3>
      <p>{concertTitle ?? 'Concert không xác định'}</p>
      <dl>
        <div>
          <dt>Nhà cung cấp</dt>
          <dd>{job.provider ?? 'Đang chờ'}</dd>
        </div>
        <div>
          <dt>Ký tự nguồn</dt>
          <dd>{job.extractedCharCount?.toLocaleString('vi-VN') ?? '—'}</dd>
        </div>
        <div>
          <dt>Thời lượng</dt>
          <dd>{duration(job)}</dd>
        </div>
      </dl>
      {job.errorMessage ? <div className="ai-snapshot-error">{job.errorMessage}</div> : null}
      <button type="button" onClick={onOpen}>
        {job.status === 'DONE' ? 'Rà soát nội dung' : 'Xem chi tiết'} <Eye size={15} />
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
            <span>Rà soát giới thiệu nghệ sĩ</span>
            <h2 id="ai-review-title">{concert?.title ?? job.originalFileName}</h2>
          </div>
          <button type="button" aria-label="Đóng" onClick={onClose} disabled={busy} autoFocus>
            <X size={20} />
          </button>
        </header>
        <div className="ai-review-body">
          {loading ? <div className="batch-detail-loading">Đang tải tác vụ mới nhất...</div> : null}
          <div className="ai-review-meta">
            <ArtistJobStatus status={job.status} />
            <span>{job.originalFileName}</span>
            <span>
              {job.provider ?? 'Chưa có nhà cung cấp'} · {job.model ?? 'chưa có model'}
            </span>
          </div>
          {isActive(job.status) ? (
            <div className="guest-indeterminate" aria-label="AI đang xử lý">
              <span />
            </div>
          ) : null}
          <dl className="ai-review-facts">
            <div>
              <dt>Tạo lúc</dt>
              <dd>{dateTime.format(new Date(job.createdAt))}</dd>
            </div>
            <div>
              <dt>Thời lượng</dt>
              <dd>{duration(job)}</dd>
            </div>
            <div>
              <dt>Ký tự trích xuất</dt>
              <dd>{job.extractedCharCount?.toLocaleString('vi-VN') ?? 'Chưa có'}</dd>
            </div>
            <div>
              <dt>Xuất bản</dt>
              <dd>
                {job.appliedAt
                  ? dateTime.format(new Date(job.appliedAt))
                  : 'Cần biên tập trong không gian concert'}
              </dd>
            </div>
          </dl>
          {job.resultBio ? (
            <article className="ai-bio-draft">
              <span>Bản nháp do AI tạo</span>
              <p>{job.resultBio}</p>
            </article>
          ) : null}
          {job.errorMessage ? (
            <div className="batch-error-detail">
              <span>Tác vụ thất bại</span>
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
            Đóng
          </button>
          {job.status === 'FAILED' ? (
            <button
              className="admin-primary-action"
              type="button"
              onClick={onRetry}
              disabled={busy}
            >
              <RotateCw size={16} />
              {retrying ? 'Đang thử lại...' : 'Thử lại tác vụ'}
            </button>
          ) : null}
        </footer>
      </section>
      </div>
    </ModalPortal>
  );
}
