import { type FormEvent, type ReactNode, useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarDays,
  ClipboardCheck,
  FileUp,
  ListChecks,
  Music2,
  ReceiptText,
  Settings2,
  Sparkles,
  Ticket,
  Users,
} from 'lucide-react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import {
  composeArtistBioDraft,
  getAdminOrders,
  getArtistBioJobs,
  getBatchLog,
  getConcertGuestList,
  getManagedCheckinSummary,
  getManagedConcert,
  importGuestList,
  publishConcertArtistBio,
  submitArtistBioJob,
  updateConcert,
  uploadConcertPoster,
  type ArtistBioJob,
  type BatchLog,
  type CheckinSummary,
  type ConcertMutation,
  type GuestListEntry,
  type ManagementApiScope,
} from '../../api/admin';
import type { ConcertDetail } from '../../api/concerts';
import type { Order } from '../../api/orders';
import { commandMessage, isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useToast } from '../../components/feedback/toast-context';

type WorkspaceTab = 'overview' | 'details' | 'tickets' | 'guests' | 'operations' | 'artist';

const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });
const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof CalendarDays }> = [
  { id: 'overview', label: 'Tổng quan', icon: CalendarDays },
  { id: 'details', label: 'Thông tin & lịch', icon: Settings2 },
  { id: 'tickets', label: 'Hạng vé', icon: Ticket },
  { id: 'guests', label: 'Khách mời', icon: Users },
  { id: 'operations', label: 'Đơn hàng & check-in', icon: ClipboardCheck },
  { id: 'artist', label: 'Nghệ sĩ & AI', icon: Sparkles },
];

function isActiveGuestImport(status: BatchLog['status']) {
  return status === 'PENDING' || status === 'RUNNING';
}

function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}

function toForm(concert: ConcertDetail): ConcertMutation {
  return {
    title: concert.title,
    description: concert.description,
    venueName: concert.venueName,
    venueAddress: concert.venueAddress,
    eventDate: toLocalInput(concert.eventDate),
    doorsOpenAt: toLocalInput(concert.doorsOpenAt),
    saleStartAt: toLocalInput(concert.saleStartAt),
    saleEndAt: toLocalInput(concert.saleEndAt),
    seatMapSvg: concert.seatMapSvg,
  };
}

function toPayload(form: ConcertMutation): ConcertMutation {
  const toIso = (value: string | null) => (value ? new Date(value).toISOString() : null);
  return {
    ...form,
    title: form.title.trim(),
    venueName: form.venueName.trim(),
    venueAddress: form.venueAddress.trim(),
    description: form.description?.trim() || null,
    eventDate: toIso(form.eventDate)!,
    doorsOpenAt: toIso(form.doorsOpenAt),
    saleStartAt: toIso(form.saleStartAt)!,
    saleEndAt: toIso(form.saleEndAt),
  };
}

function managementRoot(scope: ManagementApiScope) {
  return scope === 'admin' ? '/admin' : '/organizer';
}

function parseWorkspaceTab(value: string | null): WorkspaceTab {
  return tabs.some((item) => item.id === value) ? (value as WorkspaceTab) : 'overview';
}

export function ConcertWorkspacePage({ apiScope = 'admin' }: { apiScope?: ManagementApiScope }) {
  const { id } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState<WorkspaceTab>(() => parseWorkspaceTab(searchParams.get('tab')));
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
  const [guests, setGuests] = useState<GuestListEntry[]>([]);
  const [guestTotal, setGuestTotal] = useState(0);
  const [orders, setOrders] = useState<Order[]>([]);
  const [checkin, setCheckin] = useState<CheckinSummary | null>(null);
  const [artistJobs, setArtistJobs] = useState<ArtistBioJob[]>([]);
  const [selectedArtistSourceIds, setSelectedArtistSourceIds] = useState<string[]>([]);
  const [combiningArtistSources, setCombiningArtistSources] = useState(false);
  const [artistBioDraft, setArtistBioDraft] = useState('');
  const [publishingArtistBio, setPublishingArtistBio] = useState(false);
  const [uploadingArtistSources, setUploadingArtistSources] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState<ConcertMutation | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingPoster, setUploadingPoster] = useState(false);
  const [guestQuery, setGuestQuery] = useState('');
  const [activeOnly, setActiveOnly] = useState(false);
  const [guestImportFile, setGuestImportFile] = useState<File | null>(null);
  const [guestImportScheduled, setGuestImportScheduled] = useState(false);
  const [guestImporting, setGuestImporting] = useState(false);
  const [activeGuestImportId, setActiveGuestImportId] = useState('');

  useEffect(() => {
    const nextTab = parseWorkspaceTab(searchParams.get('tab'));
    setTab((current) => (current === nextTab ? current : nextTab));
  }, [searchParams]);

  const selectTab = useCallback(
    (nextTab: WorkspaceTab) => {
      setTab(nextTab);
      const nextParams = new URLSearchParams(searchParams);
      if (nextTab === 'overview') nextParams.delete('tab');
      else nextParams.set('tab', nextTab);
      setSearchParams(nextParams, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  const load = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      setLoading(true);
      setError('');
      try {
        const [nextConcert, guestPage, nextOrders, nextCheckin, artistPage] = await Promise.all([
          getManagedConcert(id, signal, apiScope),
          getConcertGuestList(id, 0, 100, signal, apiScope),
          getAdminOrders({ concertId: id }, apiScope),
          getManagedCheckinSummary(id, signal, apiScope),
          getArtistBioJobs({ concertId: id, page: 0, size: 5 }, signal, apiScope),
        ]);
        setConcert(nextConcert);
        setForm(toForm(nextConcert));
        setArtistBioDraft(nextConcert.artistBio ?? '');
        setGuests(guestPage.content);
        setGuestTotal(guestPage.totalElements);
        setOrders(nextOrders);
        setCheckin(nextCheckin);
        setArtistJobs(artistPage.content);
        setSelectedArtistSourceIds([]);
      } catch (requestError) {
        if (!isRequestCanceled(requestError))
          setError(
            requestError instanceof Error
              ? requestError.message
              : 'Không thể tải Concert Workspace.',
          );
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [apiScope, id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refreshGuests = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) return;
      const refreshed = await getConcertGuestList(id, 0, 100, signal, apiScope);
      setGuests(refreshed.content);
      setGuestTotal(refreshed.totalElements);
    },
    [apiScope, id],
  );

  useEffect(() => {
    if (!activeGuestImportId) return;
    const controller = new AbortController();
    let timer: number | undefined;

    const pollImport = async () => {
      try {
        const batch = await getBatchLog(activeGuestImportId, controller.signal, apiScope);
        if (isActiveGuestImport(batch.status)) {
          timer = window.setTimeout(() => void pollImport(), 1500);
          return;
        }
        if (batch.status === 'SUCCESS' || batch.status === 'PARTIAL') {
          await refreshGuests(controller.signal);
          if (!controller.signal.aborted) {
            toast.success('Danh sĂ¡ch khĂ¡ch má»i Ä‘Ã£ Ä‘Æ°á»£c cáº­p nháº­t.');
          }
        }
        if (!controller.signal.aborted) setActiveGuestImportId('');
      } catch (requestError) {
        if (!isRequestCanceled(requestError) && !controller.signal.aborted) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : 'KhĂ´ng thá»ƒ cáº­p nháº­t tráº¡ng thĂ¡i import khĂ¡ch má»i.',
          );
          setActiveGuestImportId('');
        }
      }
    };

    void pollImport();
    return () => {
      controller.abort();
      if (timer) window.clearTimeout(timer);
    };
  }, [activeGuestImportId, apiScope, refreshGuests, toast]);

  const ticketStats = useMemo(
    () =>
      concert?.ticketTypes.reduce(
        (total, item) => ({
          inventory: total.inventory + item.totalQuantity,
          available: total.available + item.availableQty,
        }),
        { inventory: 0, available: 0 },
      ) ?? { inventory: 0, available: 0 },
    [concert],
  );
  const paidOrders = useMemo(() => orders.filter((order) => order.status === 'PAID'), [orders]);
  const revenue = useMemo(
    () => paidOrders.reduce((total, order) => total + order.totalAmount, 0),
    [paidOrders],
  );
  const visibleGuests = useMemo(() => {
    const query = guestQuery.trim().toLocaleLowerCase('vi');
    return guests.filter(
      (guest) =>
        (!activeOnly || guest.active) &&
        (!query ||
          [guest.fullName, guest.phone, guest.category, guest.sponsorName]
            .filter(Boolean)
            .join(' ')
            .toLocaleLowerCase('vi')
            .includes(query)),
    );
  }, [activeOnly, guestQuery, guests]);

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!id || !form) return;
    setSaving(true);
    try {
      const result = await updateConcert(id, toPayload(form), apiScope);
      setConcert(result.data);
      setForm(toForm(result.data));
      toast.success('Đã lưu cấu hình concert.');
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'Không thể lưu cấu hình concert.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function replacePoster(file: File | null) {
    if (!id || !file) return;
    setUploadingPoster(true);
    try {
      const result = await uploadConcertPoster(id, file, apiScope);
      setConcert(result.data);
      toast.success('Đã cập nhật poster concert.');
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'Không thể tải poster lên.',
      );
    } finally {
      setUploadingPoster(false);
    }
  }

  async function uploadArtistSources(files: File[]) {
    if (!id || !files.length) return;
    setUploadingArtistSources(true);
    try {
      for (const file of Array.from(files)) {
        await submitArtistBioJob(id, file, apiScope);
      }
      const refreshed = await getArtistBioJobs(
        { concertId: id, page: 0, size: 10 },
        undefined,
        apiScope,
      );
      setArtistJobs(refreshed.content);
      toast.success(`${files.length} tài liệu đã được gửi để tạo bản nháp.`);
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể gửi tài liệu nguồn cho AI.',
      );
    } finally {
      setUploadingArtistSources(false);
    }
  }

  async function publishArtistBio() {
    if (!id || !artistBioDraft.trim()) return;
    setPublishingArtistBio(true);
    try {
      await publishConcertArtistBio(id, artistBioDraft.trim(), apiScope);
      setConcert((current) =>
        current ? { ...current, artistBio: artistBioDraft.trim() } : current,
      );
      toast.success('Đã xuất bản nội dung nghệ sĩ lên trang concert công khai.');
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể xuất bản nội dung nghệ sĩ.',
      );
    } finally {
      setPublishingArtistBio(false);
    }
  }

  function toggleArtistSource(jobId: string) {
    setSelectedArtistSourceIds((current) =>
      current.includes(jobId) ? current.filter((id) => id !== jobId) : [...current, jobId],
    );
  }

  async function combineArtistSources() {
    if (!id || selectedArtistSourceIds.length < 2) return;
    setCombiningArtistSources(true);
    try {
      const result = await composeArtistBioDraft(id, selectedArtistSourceIds, apiScope);
      setArtistBioDraft(result.data.resultBio ?? '');
      setArtistJobs((current) => [result.data, ...current]);
      setSelectedArtistSourceIds([]);
      toast.success('Đã tổng hợp các nguồn đã chọn thành một bản nháp để biên tập.');
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể tổng hợp các tài liệu nguồn.',
      );
    } finally {
      setCombiningArtistSources(false);
    }
  }

  function chooseGuestImportFile(file: File | null) {
    if (!file) {
      setGuestImportFile(null);
      return;
    }
    if (!file.name.toLowerCase().endsWith('.csv')) {
      toast.error('Chỉ chấp nhận file CSV.');
      setGuestImportFile(null);
      return;
    }
    setGuestImportFile(file);
  }

  async function submitGuestImport() {
    if (!id || !guestImportFile) return;
    setGuestImporting(true);
    try {
      const result = await importGuestList(id, guestImportFile, apiScope, guestImportScheduled);
      toast.success(
        commandMessage(
          result.message,
          guestImportScheduled
            ? 'Đã xếp file CSV vào hàng chờ scheduler.'
            : 'Đã import danh sách khách mời cho concert.',
        ),
      );
      setGuestImportFile(null);
      if (guestImportScheduled) {
        await refreshGuests();
      } else {
        setActiveGuestImportId(result.data.batchLogId);
      }
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể import danh sách khách mời.',
      );
    } finally {
      setGuestImporting(false);
    }
  }

  if (loading)
    return (
      <div className="admin-row-skeleton" aria-live="polite">
        <span />
        <span />
        <span />
      </div>
    );
  if (error || !concert || !form)
    return (
      <div className="admin-notice error">
        {error || 'Concert không tồn tại hoặc bạn không có quyền truy cập.'}
      </div>
    );

  const root = managementRoot(apiScope);
  const activeGuests = guests.filter((guest) => guest.active).length;

  return (
    <>
      <AdminPageHeader
        eyebrow="Không gian quản lý concert"
        title={concert.title}
        description={`${concert.venueName} · ${dateTime.format(new Date(concert.eventDate))}`}
        actions={
          <span className={`admin-status status-${concert.status.toLowerCase()}`}>
            {concert.status.replace('_', ' ')}
          </span>
        }
      />

      <section className="concert-workspace-hero">
        <img
          src={
            concert.posterUrl ??
            'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80'
          }
          alt=""
        />
        <div>
          <span>Vé mở bán</span>
          <strong>{dateTime.format(new Date(concert.saleStartAt))}</strong>
          <p>
            {concert.saleEndAt
              ? `Kết thúc bán: ${dateTime.format(new Date(concert.saleEndAt))}`
              : 'Bán đến khi concert diễn ra'}
          </p>
        </div>
        <div>
          <span>Trạng thái vận hành</span>
          <strong>{concert.status.replace('_', ' ')}</strong>
          <p>
            {ticketStats.available} / {ticketStats.inventory} vé còn khả dụng
          </p>
        </div>
      </section>

      <nav className="concert-workspace-tabs" aria-label="Quản lý concert">
        {tabs.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              className={tab === item.id ? 'active' : ''}
              onClick={() => selectTab(item.id)}
            >
              <Icon size={16} />
              {item.label}
            </button>
          );
        })}
      </nav>

      {tab === 'overview' ? (
        <section className="concert-workspace-grid">
          <Metric
            icon={<Ticket size={19} />}
            label="Vé còn khả dụng"
            value={`${ticketStats.available} / ${ticketStats.inventory}`}
            onOpen={() => selectTab('tickets')}
          />
          <Metric
            icon={<Users size={19} />}
            label="Khách mời active"
            value={`${activeGuests} / ${guestTotal}`}
            onOpen={() => selectTab('guests')}
          />
          <Metric
            icon={<ReceiptText size={19} />}
            label="Doanh thu đã thanh toán"
            value={money.format(revenue)}
            onOpen={() => selectTab('operations')}
          />
          <Metric
            icon={<ClipboardCheck size={19} />}
            label="Đã check-in"
            value={checkin ? `${checkin.checkedIn} / ${checkin.totalTickets}` : 'Chưa có dữ liệu'}
            onOpen={() => selectTab('operations')}
          />
          <section className="concert-workspace-card concert-workspace-card-wide">
            <div className="concert-card-heading">
              <div>
                <span>Việc cần hoàn tất</span>
                <h2>Sẵn sàng mở bán</h2>
              </div>
              <ListChecks size={20} />
            </div>
            <ul className="concert-readiness-list">
              <li className={concert.ticketTypes.length ? 'done' : ''}>
                {concert.ticketTypes.length ? 'Đã có hạng vé' : 'Cần tạo hạng vé'}
              </li>
              <li className={concert.posterUrl ? 'done' : ''}>
                {concert.posterUrl ? 'Đã có poster' : 'Cần tải poster'}
              </li>
              <li
                className={
                  artistJobs.some((job) => job.status === 'DONE') || concert.artistBio ? 'done' : ''
                }
              >
                {artistJobs.some((job) => job.status === 'DONE') || concert.artistBio
                  ? 'Đã có nội dung nghệ sĩ'
                  : 'Có thể bổ sung Artist Bio'}
              </li>
              <li className={activeGuests ? 'done' : ''}>
                {activeGuests
                  ? `${activeGuests} khách mời đang hiệu lực`
                  : 'Chưa có Guest List active'}
              </li>
            </ul>
          </section>
        </section>
      ) : null}

      {tab === 'details' ? (
        <form className="concert-settings-form" onSubmit={saveDetails}>
          <div className="concert-workspace-card concert-workspace-card-wide">
            <div className="concert-card-heading">
              <div>
                <span>Cấu hình cơ bản</span>
                <h2>Thông tin, lịch trình và sơ đồ</h2>
              </div>
              <Settings2 size={20} />
            </div>
            <div className="admin-form-grid">
              <label className="admin-field admin-field-wide">
                <span>Tên concert</span>
                <input
                  required
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>Thời gian diễn</span>
                <input
                  required
                  type="datetime-local"
                  value={form.eventDate}
                  onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>Mở cửa</span>
                <input
                  type="datetime-local"
                  value={form.doorsOpenAt ?? ''}
                  onChange={(e) => setForm({ ...form, doorsOpenAt: e.target.value || null })}
                />
              </label>
              <label className="admin-field">
                <span>Mở bán vé</span>
                <input
                  required
                  type="datetime-local"
                  value={form.saleStartAt}
                  onChange={(e) => setForm({ ...form, saleStartAt: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>Kết thúc bán</span>
                <input
                  type="datetime-local"
                  value={form.saleEndAt ?? ''}
                  onChange={(e) => setForm({ ...form, saleEndAt: e.target.value || null })}
                />
              </label>
              <label className="admin-field">
                <span>Địa điểm</span>
                <input
                  required
                  value={form.venueName}
                  onChange={(e) => setForm({ ...form, venueName: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>Địa chỉ</span>
                <input
                  required
                  value={form.venueAddress}
                  onChange={(e) => setForm({ ...form, venueAddress: e.target.value })}
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>Mô tả</span>
                <textarea
                  rows={5}
                  value={form.description ?? ''}
                  onChange={(e) => setForm({ ...form, description: e.target.value || null })}
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>Sơ đồ chỗ (SVG)</span>
                <textarea
                  rows={5}
                  value={form.seatMapSvg ?? ''}
                  onChange={(e) => setForm({ ...form, seatMapSvg: e.target.value || null })}
                  placeholder="Dán nội dung SVG đã được kiểm duyệt"
                />
              </label>
            </div>
            <footer>
              <label className="admin-secondary-action">
                <FileUp size={16} />
                {uploadingPoster ? 'Đang tải poster...' : 'Thay poster'}
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingPoster}
                  onChange={(e) => void replacePoster(e.target.files?.[0] ?? null)}
                />
              </label>
              <button className="admin-primary-action" disabled={saving}>
                {saving ? 'Đang lưu...' : 'Lưu cấu hình'}
              </button>
            </footer>
          </div>
        </form>
      ) : null}

      {tab === 'tickets' ? (
        <section className="concert-workspace-card">
          <div className="concert-card-heading">
            <div>
              <span>Inventory</span>
              <h2>Hạng vé và tồn kho</h2>
            </div>
            <Link
              className="admin-primary-action"
              to={`${root}/ticket-types?concertId=${id}&returnTo=${encodeURIComponent(`${root}/concerts/${id}?tab=tickets`)}`}
            >
              Quản lý hạng vé
            </Link>
          </div>
          <p className="concert-workspace-hint">
            Các hạng vé bên dưới lấy trực tiếp từ concert hiện tại. Nếu cần tạo/sửa/xóa chi tiết,
            trang quản lý riêng sẽ có nút quay lại đúng tab này.
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Hạng vé</th>
                  <th>Giá</th>
                  <th>Tồn kho</th>
                  <th>Trạng thái</th>
                </tr>
              </thead>
              <tbody>
                {concert.ticketTypes.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                    </td>
                    <td>{money.format(item.price)}</td>
                    <td>
                      {item.availableQty} / {item.totalQuantity}
                    </td>
                    <td>
                      <span
                        className={
                          item.isActive ? 'status-badge badge-success' : 'status-badge badge-muted'
                        }
                      >
                        {item.isActive ? 'Đang hoạt động' : 'Tạm ngưng'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'guests' ? (
        <section className="concert-workspace-card">
          <div className="concert-card-heading">
            <div>
              <span>Danh sách khách mời</span>
              <h2>{guestTotal} khách mời đã nhập</h2>
            </div>
            <Link
              className="admin-secondary-action"
              to={`${root}/guests?concertId=${id}&returnTo=${encodeURIComponent(`${root}/concerts/${id}?tab=guests`)}`}
            >
              Lịch sử batch
            </Link>
          </div>
          <div className="concert-inline-action-panel">
            <div>
              <strong>Import CSV cho concert này</strong>
              <span>
                Chọn file danh sách khách, import ngay hoặc xếp lịch xử lý mà không rời màn chi
                tiết.
              </span>
            </div>
            <label className="admin-secondary-action">
              <FileUp size={16} />
              {guestImportFile ? guestImportFile.name : 'Chọn CSV'}
              <input
                hidden
                type="file"
                accept=".csv,text/csv"
                onChange={(event) => {
                  chooseGuestImportFile(event.target.files?.[0] ?? null);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            <label className="concert-inline-check">
              <input
                type="checkbox"
                checked={guestImportScheduled}
                onChange={(event) => setGuestImportScheduled(event.target.checked)}
              />{' '}
              Qua lịch xử lý
            </label>
            <button
              className="admin-primary-action"
              type="button"
              disabled={!guestImportFile || guestImporting}
              onClick={() => void submitGuestImport()}
            >
              {guestImporting ? 'Đang import...' : 'Import vào danh sách khách'}
            </button>
          </div>
          <div className="concert-workspace-toolbar">
            <input
              value={guestQuery}
              onChange={(e) => setGuestQuery(e.target.value)}
              placeholder="Tìm tên, số điện thoại, hạng hoặc đơn vị mời..."
            />
            <label>
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => setActiveOnly(e.target.checked)}
              />{' '}
              Chỉ khách hiệu lực
            </label>
          </div>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Khách mời</th>
                  <th>Hạng</th>
                  <th>Đơn vị mời</th>
                  <th>Trạng thái</th>
                  <th>Check-in</th>
                  <th>Ghi chú</th>
                </tr>
              </thead>
              <tbody>
                {visibleGuests.map((guest) => (
                  <tr key={guest.id}>
                    <td>
                      <strong>{guest.fullName}</strong>
                      <span className="admin-table-secondary">{guest.phone}</span>
                    </td>
                    <td>{guest.category ?? '—'}</td>
                    <td>{guest.sponsorName ?? '—'}</td>
                    <td>
                      <span
                        className={
                          guest.active ? 'status-badge badge-success' : 'status-badge badge-muted'
                        }
                      >
                        {guest.active ? 'Hiệu lực' : 'Đã hủy'}
                      </span>
                    </td>
                    <td>
                      {guest.checkedInAt ? (
                        <>
                          <strong className="admin-table-primary">Đã vào cổng</strong>
                          <span className="admin-table-secondary">
                            {guest.checkinGate ?? 'VIP'} ·{' '}
                            {dateTime.format(new Date(guest.checkedInAt))}
                          </span>
                        </>
                      ) : (
                        'Chưa vào'
                      )}
                    </td>
                    <td>{guest.notes ?? '—'}</td>
                  </tr>
                ))}
                {!visibleGuests.length ? (
                  <tr>
                    <td colSpan={6} className="concert-empty-row">
                      Chưa có khách mời phù hợp.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {tab === 'operations' ? (
        <section className="concert-workspace-grid">
          <section className="concert-workspace-card">
            <div className="concert-card-heading">
              <div>
                <span>Check-in</span>
                <h2>Vận hành tại cổng</h2>
              </div>
              <Link className="admin-secondary-action" to={`${root}/orders?concertId=${id}`}>
                Xem vé
              </Link>
            </div>
            <dl className="concert-definition-list">
              <div>
                <dt>Tổng vé</dt>
                <dd>{checkin?.totalTickets ?? 0}</dd>
              </div>
              <div>
                <dt>Đã vào cổng</dt>
                <dd>{checkin?.checkedIn ?? 0}</dd>
              </div>
              <div>
                <dt>Online / Offline</dt>
                <dd>
                  {checkin ? `${checkin.onlineCheckins} / ${checkin.offlineCheckins}` : '0 / 0'}
                </dd>
              </div>
            </dl>
          </section>
          <section className="concert-workspace-card">
            <div className="concert-card-heading">
              <div>
                <span>Đơn hàng</span>
                <h2>{orders.length} đơn phát sinh</h2>
              </div>
              <Link className="admin-secondary-action" to={`${root}/orders?concertId=${id}`}>
                Xem đơn hàng
              </Link>
            </div>
            <dl className="concert-definition-list">
              <div>
                <dt>Đã thanh toán</dt>
                <dd>{paidOrders.length}</dd>
              </div>
              <div>
                <dt>Chờ thanh toán</dt>
                <dd>{orders.filter((order) => order.status === 'AWAITING_PAYMENT').length}</dd>
              </div>
              <div>
                <dt>Doanh thu</dt>
                <dd>{money.format(revenue)}</dd>
              </div>
            </dl>
          </section>
        </section>
      ) : null}

      {tab === 'artist' ? (
        <section className="concert-workspace-card artist-content-workspace">
          <div className="concert-card-heading">
            <div>
              <span>Nghệ sĩ & nội dung công khai</span>
              <h2>Biên tập trước khi xuất bản</h2>
            </div>
            <Link
              className="admin-secondary-action"
              to={`${root}/artist-bio?concertId=${id}&returnTo=${encodeURIComponent(`${root}/concerts/${id}?tab=artist`)}`}
            >
              Lịch sử AI đầy đủ
            </Link>
          </div>
          <p className="artist-content-intro">
            Mỗi PDF tạo một bản nháp nguồn. Chọn từ hai nguồn đã hoàn tất trở lên để AI tổng hợp
            thành một bản nháp chung, sau đó bạn biên tập và xuất bản.
          </p>
          <div className="artist-content-grid">
            <section>
              <div className="artist-content-section-heading">
                <div>
                  <strong>Nguồn tham khảo</strong>
                  <span>Có thể thêm nhiều press kit hoặc hồ sơ nghệ sĩ.</span>
                </div>
                <label className="admin-primary-action">
                  <FileUp size={16} />
                  {uploadingArtistSources ? 'Đang gửi...' : 'Thêm tài liệu PDF'}
                  <input
                    hidden
                    type="file"
                    multiple
                    accept="application/pdf"
                    disabled={uploadingArtistSources}
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.currentTarget.value = '';
                      void uploadArtistSources(files);
                    }}
                  />
                </label>
              </div>
              <div className="concert-artist-jobs">
                {artistJobs.map((job) => (
                  <div key={job.id} className="artist-source-item">
                    {job.status === 'DONE' && job.resultBio ? (
                      <input
                        className="artist-source-checkbox"
                        type="checkbox"
                        checked={selectedArtistSourceIds.includes(job.id)}
                        onChange={() => toggleArtistSource(job.id)}
                        aria-label={`Chọn ${job.originalFileName} để tổng hợp`}
                      />
                    ) : null}
                    <Music2 size={17} />
                    <span>
                      <strong>{job.originalFileName}</strong>
                      <small>
                        {job.status} · {dateTime.format(new Date(job.createdAt))}
                      </small>
                    </span>
                    {job.status === 'DONE' && job.resultBio ? (
                      <button
                        type="button"
                        className="admin-secondary-action"
                        onClick={() => setArtistBioDraft(job.resultBio ?? '')}
                      >
                        Xem riêng
                      </button>
                    ) : null}
                  </div>
                ))}
                {!artistJobs.length ? (
                  <p>Chưa có tài liệu nguồn. Thêm press kit để bắt đầu tạo bản nháp.</p>
                ) : null}
              </div>
              <button
                className="admin-primary-action artist-combine-action"
                type="button"
                disabled={selectedArtistSourceIds.length < 2 || combiningArtistSources}
                onClick={() => void combineArtistSources()}
              >
                {combiningArtistSources
                  ? 'Đang tổng hợp...'
                  : `Tổng hợp ${selectedArtistSourceIds.length} nguồn đã chọn`}
              </button>
            </section>
            <section className="artist-publish-panel">
              <div className="artist-content-section-heading">
                <div>
                  <strong>Nội dung sẽ hiển thị công khai</strong>
                  <span>Khán giả xem phần này trước khi vào phòng chờ.</span>
                </div>
                <span
                  className={
                    concert.artistBio ? 'status-badge badge-success' : 'status-badge badge-muted'
                  }
                >
                  {concert.artistBio ? 'Đã xuất bản' : 'Bản nháp'}
                </span>
              </div>
              <textarea
                value={artistBioDraft}
                maxLength={2000}
                rows={9}
                onChange={(event) => setArtistBioDraft(event.target.value)}
                placeholder="Tổng hợp các nguồn hoặc tự viết giới thiệu nghệ sĩ..."
              />
              <div className="artist-publish-footer">
                <span>{artistBioDraft.length}/2000 ký tự</span>
                <button
                  className="admin-primary-action"
                  type="button"
                  disabled={!artistBioDraft.trim() || publishingArtistBio}
                  onClick={() => void publishArtistBio()}
                >
                  {publishingArtistBio ? 'Đang xuất bản...' : 'Xuất bản lên trang concert'}
                </button>
              </div>
            </section>
          </div>
        </section>
      ) : null}
    </>
  );
}

function Metric({
  icon,
  label,
  value,
  onOpen,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  onOpen: () => void;
}) {
  return (
    <button type="button" className="concert-workspace-metric" onClick={onOpen}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>Xem chi tiết →</em>
    </button>
  );
}
