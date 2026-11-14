import { dateFormatter, numberFormatter } from '../../data/formatters';
import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { ConcertTextFields } from '../../features/concert/ConcertTextFields';
import { editConcertText } from '../../features/concert/concertText';
import { PublicationPanel } from '../../features/organizations/PublicationPanel';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
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
  type ConcertMutation,
  type ManagementApiScope,
} from '../../api/admin';
import type { ConcertDetail } from '../../api/concerts';
import { isRequestCanceled } from '../../api/client';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { useToast } from '../../components/feedback/toast-context';
import { EventDisruptionPanel } from './EventDisruptionPanel';

type WorkspaceTab = 'overview' | 'details' | 'tickets' | 'guests' | 'operations' | 'artist';

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });
const money = numberFormatter({
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

const tabs: Array<{ id: WorkspaceTab; label: string; icon: typeof CalendarDays }> = [
  { id: 'overview', get label() { return translate("admin:concertWorkspacePage_tongQuan"); }, icon: CalendarDays },
  { id: 'details', get label() { return translate("admin:concertWorkspacePage_thongTinLich"); }, icon: Settings2 },
  { id: 'tickets', get label() { return translate("admin:concertWorkspacePage_hangVe"); }, icon: Ticket },
  { id: 'guests', get label() { return translate("admin:concertWorkspacePage_khachMoi"); }, icon: Users },
  { id: 'operations', get label() { return translate("admin:concertWorkspacePage_donHangCheckIn"); }, icon: ClipboardCheck },
  { id: 'artist', get label() { return translate("admin:concertWorkspacePage_ngheSiAi"); }, icon: Sparkles },
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
    ...editConcertText(concert),
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

function useWorkspaceSection<T>(enabled: boolean, fetchSection: (signal: AbortSignal) => Promise<T>) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(enabled);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => setRevision((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    setData(null);
    setError('');
    setLoading(true);
    void fetchSection(controller.signal).then((result) => {
      if (!controller.signal.aborted) setData(result);
    }).catch((failure: unknown) => {
      if (!controller.signal.aborted) setError(failure instanceof Error ? failure.message : translate("admin:concertWorkspacePage_khongTaiDuocDuLieu"));
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [enabled, fetchSection, revision]);

  return { data, error, loading, retry };
}

function SectionStatus({ error, loading, retry }: { error: string; loading: boolean; retry: () => void }) {
  useTranslation();
  if (loading) return <p role="status">{translate("admin:concertWorkspacePage_dangTaiDuLieu")}</p>;
  if (!error) return null;
  return <p role="alert">{error} <button type="button" className="admin-secondary-action" onClick={retry}>{translate("admin:concertWorkspacePage_thuLai")}</button></p>;
}

const workspaceStatus: Record<ConcertDetail['status'], string> = {
  get DRAFT() { return translate("admin:concertWorkspacePage_banNhap"); }, get ON_SALE() { return translate("admin:concertWorkspacePage_daCauHinhMoBan"); }, get SOLD_OUT() { return translate("admin:concertWorkspacePage_hetVe"); },
  get COMPLETED() { return translate("admin:concertWorkspacePage_daDienRa"); }, get CANCELLED() { return translate("admin:concertWorkspacePage_daHuy"); },
};

export function ConcertWorkspacePage({ apiScope = 'admin' }: { apiScope?: ManagementApiScope }) {
  useTranslation();
  const { id } = useParams();
  const organization = useOrganization();
  const canViewOrders = apiScope === 'admin' || !!organization?.selected?.grants.includes('FINANCE');
  const [searchParams, setSearchParams] = useSearchParams();
  const toast = useToast();
  const [tab, setTab] = useState<WorkspaceTab>(() => parseWorkspaceTab(searchParams.get('tab')));
  const [concert, setConcert] = useState<ConcertDetail | null>(null);
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
  const [guestPageIndex, setGuestPageIndex] = useState(0);
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
    async (signal?: AbortSignal, background = false) => {
      if (!id) return;
      if (!background) {
        setLoading(true);
        setError('');
      }
      try {
        const nextConcert = await getManagedConcert(id, signal, apiScope);
        if (signal?.aborted) return;
        setConcert(nextConcert);
        setForm(toForm(nextConcert));
        setArtistBioDraft(nextConcert.artistBio ?? '');
      } catch (requestError) {
        if (!background && !isRequestCanceled(requestError))
          setError(
            requestError instanceof Error
              ? requestError.message
              : translate("admin:concertWorkspacePage_khongTheTaiConcertWorkspace"),
          );
      } finally {
        if (!background && !signal?.aborted) setLoading(false);
      }
    },
    [apiScope, id],
  );

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const refreshAfterDisruption = useCallback((signal: AbortSignal) => void load(signal, true), [load]);

  const guestSection = useWorkspaceSection(!!id, useCallback(
    (signal: AbortSignal) => getConcertGuestList(id!, guestPageIndex, 20, signal, apiScope,
      { query: guestQuery, activeOnly }),
    [id, guestPageIndex, apiScope, guestQuery, activeOnly],
  ));
  const orderSection = useWorkspaceSection(!!id && canViewOrders, useCallback(
    (signal: AbortSignal) => getAdminOrders({ concertId: id }, apiScope, signal), [id, apiScope],
  ));
  const checkinSection = useWorkspaceSection(!!id, useCallback(
    (signal: AbortSignal) => getManagedCheckinSummary(id!, signal, apiScope), [id, apiScope],
  ));
  const artistSection = useWorkspaceSection(!!id && tab === 'artist', useCallback(
    (signal: AbortSignal) => getArtistBioJobs({ concertId: id, page: 0, size: 5 }, signal, apiScope),
    [id, apiScope],
  ));
  useEffect(() => {
    if (artistSection.data) setArtistJobs(artistSection.data.content);
  }, [artistSection.data]);
  const { retry: refreshGuests } = guestSection;
  const guestTotal = guestSection.data?.totalElements;
  const checkin = checkinSection.data;

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
          refreshGuests();
          if (!controller.signal.aborted) {
            toast.success(translate("admin:concertWorkspacePage_danhSachKhachMoiDaDuocCap"));
          }
        }
        if (!controller.signal.aborted) setActiveGuestImportId('');
      } catch (requestError) {
        if (!isRequestCanceled(requestError) && !controller.signal.aborted) {
          toast.error(
            requestError instanceof Error
              ? requestError.message
              : translate("admin:concertWorkspacePage_khongTheCapNhatTrangThaiNhap"),
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
  const orders = orderSection.data;
  const paidOrders = orders?.filter((order) => order.status === 'PAID') ?? [];
  const revenue = paidOrders.reduce((total, order) => total + order.totalAmount, 0);
  const visibleGuests = guestSection.data?.content ?? [];

  async function saveDetails(event: FormEvent) {
    event.preventDefault();
    if (!id || !form || !concert) return;
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (concert.status !== 'DRAFT') {
        payload.eventDate = concert.eventDate;
        payload.doorsOpenAt = concert.doorsOpenAt;
        payload.saleStartAt = concert.saleStartAt;
        payload.saleEndAt = concert.saleEndAt;
      }
      const result = await updateConcert(id, payload, apiScope);
      setConcert(result.data);
      setForm(toForm(result.data));
      toast.success(translate("admin:concertWorkspacePage_daLuuCauHinhConcert"));
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : translate("admin:concertWorkspacePage_khongTheLuuCauHinhConcert"),
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
      toast.success(translate("admin:concertWorkspacePage_daCapNhatPosterConcert"));
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : translate("admin:concertWorkspacePage_khongTheTaiPosterLen"),
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
      toast.success(translate("admin:concertWorkspacePage_taiLieuDaDuocGuiDeTao", { arg1: files.length }));
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate("admin:concertWorkspacePage_khongTheGuiTaiLieuNguonCho"),
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
      toast.success(translate("admin:concertWorkspacePage_daXuatBanNoiDungNgheSi"));
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate("admin:concertWorkspacePage_khongTheXuatBanNoiDungNghe"),
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
      toast.success(translate("admin:concertWorkspacePage_daTongHopCacNguonDaChon"));
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate("admin:concertWorkspacePage_khongTheTongHopCacTaiLieu"),
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
      toast.error(translate("admin:concertWorkspacePage_chiChapNhanFileCsv"));
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
        guestImportScheduled
          ? translate("admin:concertWorkspacePage_daXepFileCsvVaoHangCho")
          : translate("admin:concertWorkspacePage_daImportDanhSachKhachMoiCho"),
      );
      setGuestImportFile(null);
      if (guestImportScheduled) {
        refreshGuests();
      } else {
        setActiveGuestImportId(result.data.batchLogId);
      }
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate("admin:concertWorkspacePage_khongTheImportDanhSachKhachMoi"),
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
        {error || translate("admin:concertWorkspacePage_concertKhongTonTaiHoacBanKhong")}
      </div>
    );

  const root = managementRoot(apiScope);

  return (
    <>
      <AdminPageHeader
        eyebrow={translate("admin:concertWorkspacePage_khongGianQuanLyConcert")}
        title={concert.title}
        description={`${concert.venueName} · ${dateTime.format(new Date(concert.eventDate))}`}
        actions={
          <span className={`admin-status status-${concert.status.toLowerCase()}`}>
            {workspaceStatus[concert.status]}
          </span>
        }
      />

      {apiScope === 'organizer' && tab === 'overview' && id ? (
        <PublicationPanel id={id} updatedAt={concert.updatedAt} onPublished={() => void load()} />
      ) : null}

      <section className="concert-workspace-hero">
        <img
          src={
            concert.posterUrl ??
            'https://images.unsplash.com/photo-1501386761578-eac5c94b800a?auto=format&fit=crop&w=900&q=80'
          }
          alt=""
        />
        <div>
          <span>{translate("admin:concertWorkspacePage_veMoBan")}</span>
          <strong>{dateTime.format(new Date(concert.saleStartAt))}</strong>
          <p>
            {concert.saleEndAt
              ? translate("admin:concertWorkspacePage_ketThucBan", { arg1: dateTime.format(new Date(concert.saleEndAt)) })
              : translate("admin:concertWorkspacePage_banDenKhiConcertDienRa")}
          </p>
        </div>
        <div>
          <span>{translate("admin:concertWorkspacePage_trangThaiVanHanh")}</span>
          <strong>{workspaceStatus[concert.status]}</strong>
          <p>
            {ticketStats.available} / {ticketStats.inventory} {translate("admin:concertWorkspacePage_veConKhaDung")}
          </p>
        </div>
      </section>

      <nav className="concert-workspace-tabs" aria-label={translate("admin:concertWorkspacePage_quanLyConcert")}>
        {tabs.filter((item) => item.id !== 'artist').map((item) => {
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

      {apiScope === 'admin' && tab === 'operations' && (
        <EventDisruptionPanel key={concert.id} concertId={concert.id} concertStatus={concert.status}
          onChanged={refreshAfterDisruption} />
      )}

      {tab === 'overview' ? (
        <section className="concert-workspace-grid">
          <Metric
            icon={<Ticket size={19} />}
            label={translate("admin:concertWorkspacePage_veConKhaDung_2")}
            value={`${ticketStats.available} / ${ticketStats.inventory}`}
            onOpen={() => selectTab('tickets')}
          />
          <Metric
            icon={<Users size={19} />}
            label={translate("admin:concertWorkspacePage_khachMoiTheoBoLoc")}
            value={guestTotal === undefined ? translate("admin:concertWorkspacePage_chuaCoDuLieu") : String(guestTotal)}
            onOpen={() => selectTab('guests')}
          />
          {canViewOrders ? (
            <Metric
              icon={<ReceiptText size={19} />}
              label={translate("admin:concertWorkspacePage_doanhThuDaThanhToan")}
              value={orders ? money.format(revenue) : translate("admin:concertWorkspacePage_chuaCoDuLieu")}
              onOpen={() => selectTab('operations')}
            />
          ) : null}
          <Metric
            icon={<ClipboardCheck size={19} />}
            label={translate("admin:concertWorkspacePage_daCheckIn")}
            value={checkin ? `${checkin.checkedIn} / ${checkin.totalTickets}` : translate("admin:concertWorkspacePage_chuaCoDuLieu")}
            onOpen={() => selectTab('operations')}
          />
          <section className="concert-workspace-card concert-workspace-card-wide">
            <div className="concert-card-heading">
              <div>
                <span>{translate("admin:concertWorkspacePage_viecCanHoanTat")}</span>
                <h2>{translate("admin:concertWorkspacePage_sanSangMoBan")}</h2>
              </div>
              <ListChecks size={20} />
            </div>
            <ul className="concert-readiness-list">
              <li className={concert.ticketTypes.length ? 'done' : ''}>
                {concert.ticketTypes.length ? translate("admin:concertWorkspacePage_daCoHangVe") : translate("admin:concertWorkspacePage_canTaoHangVe")}
              </li>
              <li className={concert.posterUrl ? 'done' : ''}>
                {concert.posterUrl ? translate("admin:concertWorkspacePage_daCoPoster") : translate("admin:concertWorkspacePage_canTaiPoster")}
              </li>
              <li
                className={
                  concert.artistBio ? 'done' : ''
                }
              >
                {concert.artistBio
                  ? translate("admin:concertWorkspacePage_daCoNoiDungNgheSi")
                  : translate("admin:concertWorkspacePage_coTheBoSungArtistBio")}
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
                <span>{translate("admin:concertWorkspacePage_cauHinhCoBan")}</span>
                <h2>{translate("admin:concertWorkspacePage_thongTinLichTrinhVaSoDo")}</h2>
              </div>
              <Settings2 size={20} />
            </div>
            <div className="admin-form-grid">
              <ConcertTextFields original={form.original} translations={form.translations}
                onChange={(text) => setForm({ ...form, ...text })} />
              <label className="admin-field">
                <span>{translate("admin:concertWorkspacePage_thoiGianDien")}</span>
                <input
                  required
                  type="datetime-local"
                  readOnly={concert.status !== 'DRAFT'}
                  value={form.eventDate}
                  onChange={(e) => setForm({ ...form, eventDate: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>{translate("admin:concertWorkspacePage_moCua")}</span>
                <input
                  type="datetime-local"
                  readOnly={concert.status !== 'DRAFT'}
                  value={form.doorsOpenAt ?? ''}
                  onChange={(e) => setForm({ ...form, doorsOpenAt: e.target.value || null })}
                />
              </label>
              <label className="admin-field">
                <span>{translate("admin:concertWorkspacePage_moBanVe")}</span>
                <input
                  required
                  type="datetime-local"
                  readOnly={concert.status !== 'DRAFT'}
                  value={form.saleStartAt}
                  onChange={(e) => setForm({ ...form, saleStartAt: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>{translate("admin:concertWorkspacePage_ketThucBan_2")}</span>
                <input
                  type="datetime-local"
                  readOnly={concert.status !== 'DRAFT'}
                  value={form.saleEndAt ?? ''}
                  onChange={(e) => setForm({ ...form, saleEndAt: e.target.value || null })}
                />
              </label>
              {(concert.status === 'ON_SALE' || concert.status === 'SOLD_OUT') && (
                <p className="admin-field-wide">
                  {apiScope === 'admin'
                    ? translate("admin:concertWorkspacePage_doiLichTrongMucDonHangCheck")
                    : translate("admin:concertWorkspacePage_lienHeTicketboxDeDoiLichSau")}
                </p>
              )}
              <label className="admin-field">
                <span>{translate("admin:concertWorkspacePage_diaDiem")}</span>
                <input
                  required
                  value={form.venueName}
                  onChange={(e) => setForm({ ...form, venueName: e.target.value })}
                />
              </label>
              <label className="admin-field">
                <span>{translate("admin:concertWorkspacePage_diaChi")}</span>
                <input
                  required
                  value={form.venueAddress}
                  onChange={(e) => setForm({ ...form, venueAddress: e.target.value })}
                />
              </label>
              <label className="admin-field admin-field-wide">
                <span>{translate("admin:concertWorkspacePage_soDoChoSvg")}</span>
                <textarea
                  rows={5}
                  value={form.seatMapSvg ?? ''}
                  onChange={(e) => setForm({ ...form, seatMapSvg: e.target.value || null })}
                  placeholder={translate("admin:concertWorkspacePage_danNoiDungSvgDaDuocKiem")}
                />
              </label>
            </div>
            <footer>
              <label className="admin-secondary-action">
                <FileUp size={16} />
                {uploadingPoster ? translate("admin:concertWorkspacePage_dangTaiPoster") : translate('admin:concertWorkspacePage_replacePoster')}
                <input
                  hidden
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploadingPoster}
                  onChange={(e) => void replacePoster(e.target.files?.[0] ?? null)}
                />
              </label>
              <button className="admin-primary-action" disabled={saving}>
                {saving ? translate("admin:concertWorkspacePage_dangLuu") : translate("admin:concertWorkspacePage_luuCauHinh")}
              </button>
            </footer>
          </div>
        </form>
      ) : null}

      {tab === 'tickets' ? (
        <section className="concert-workspace-card">
          <div className="concert-card-heading">
            <div>
              <span>{translate("admin:concertWorkspacePage_inventory")}</span>
              <h2>{translate("admin:concertWorkspacePage_hangVeVaTonKho")}</h2>
            </div>
            <Link
              className="admin-primary-action"
              to={`${root}/ticket-types?concertId=${id}&returnTo=${encodeURIComponent(`${root}/concerts/${id}?tab=tickets`)}`}
            >
              {translate("admin:concertWorkspacePage_quanLyHangVe")}
            </Link>
          </div>
          <p className="concert-workspace-hint">
            {translate("admin:concertWorkspacePage_cacHangVeBenDuoiLayTruc")}
          </p>
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{translate("admin:concertWorkspacePage_hangVe")}</th>
                  <th>{translate("admin:concertWorkspacePage_gia")}</th>
                  <th>{translate("admin:concertWorkspacePage_tonKho")}</th>
                  <th>{translate("admin:concertWorkspacePage_trangThai")}</th>
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
                        {item.isActive ? translate("admin:concertWorkspacePage_dangHoatDong") : translate("admin:concertWorkspacePage_tamNgung")}
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
              <span>{translate("admin:concertWorkspacePage_danhSachKhachMoi")}</span>
              <h2>{guestTotal === undefined ? translate("admin:concertWorkspacePage_danhSachKhachMoi") : translate("admin:concertWorkspacePage_khachPhuHop", { count: guestTotal })}</h2>
            </div>
            <Link
              className="admin-secondary-action"
              to={`${root}/guests?concertId=${id}&returnTo=${encodeURIComponent(`${root}/concerts/${id}?tab=guests`)}`}
            >
              {translate("admin:concertWorkspacePage_lichSuBatch")}
            </Link>
          </div>
          <div className="concert-inline-action-panel">
            <div>
              <strong>{translate("admin:concertWorkspacePage_importCsvChoConcertNay")}</strong>
              <span>
                {translate("admin:concertWorkspacePage_chonFileDanhSachKhachImportNgay")}
              </span>
            </div>
            <label className="admin-secondary-action">
              <FileUp size={16} />
              {guestImportFile ? guestImportFile.name : translate("admin:concertWorkspacePage_chonCsv")}
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
              {translate("admin:concertWorkspacePage_quaLichXuLy")}
            </label>
            <button
              className="admin-primary-action"
              type="button"
              disabled={!guestImportFile || guestImporting}
              onClick={() => void submitGuestImport()}
            >
              {guestImporting ? translate("admin:concertWorkspacePage_dangImport") : translate("admin:concertWorkspacePage_importVaoDanhSachKhach")}
            </button>
          </div>
          <div className="concert-workspace-toolbar">
            <input
              value={guestQuery}
              onChange={(e) => { setGuestQuery(e.target.value); setGuestPageIndex(0); }}
              placeholder={translate("admin:concertWorkspacePage_timTenSoDienThoaiHangHoac")}
            />
            <label>
              <input
                type="checkbox"
                checked={activeOnly}
                onChange={(e) => { setActiveOnly(e.target.checked); setGuestPageIndex(0); }}
              />{' '}
              {translate("admin:concertWorkspacePage_chiKhachHieuLuc")}
            </label>
          </div>
          <SectionStatus {...guestSection} />
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{translate("admin:concertWorkspacePage_khachMoi")}</th>
                  <th>{translate("admin:concertWorkspacePage_hang")}</th>
                  <th>{translate("admin:concertWorkspacePage_donViMoi")}</th>
                  <th>{translate("admin:concertWorkspacePage_trangThai")}</th>
                  <th>{translate("admin:concertWorkspacePage_checkIn")}</th>
                  <th>{translate("admin:concertWorkspacePage_ghiChu")}</th>
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
                        {guest.active ? translate("admin:concertWorkspacePage_hieuLuc") : translate("admin:concertWorkspacePage_daHuy")}
                      </span>
                    </td>
                    <td>
                      {guest.checkedInAt ? (
                        <>
                          <strong className="admin-table-primary">{translate("admin:concertWorkspacePage_daVaoCong")}</strong>
                          <span className="admin-table-secondary">
                            {guest.checkinGate ?? 'VIP'} ·{' '}
                            {dateTime.format(new Date(guest.checkedInAt))}
                          </span>
                        </>
                      ) : (
                        translate("admin:concertWorkspacePage_chuaVao")
                      )}
                    </td>
                    <td>{guest.notes ?? '—'}</td>
                  </tr>
                ))}
                {guestSection.data && !visibleGuests.length ? (
                  <tr>
                    <td colSpan={6} className="concert-empty-row">
                      {translate("admin:concertWorkspacePage_chuaCoKhachMoiPhuHop")}
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
          {guestSection.data && guestSection.data.totalPages > 1 ? (
            <div className="organization-form">
              <button type="button" className="admin-secondary-action" disabled={guestPageIndex === 0}
                onClick={() => setGuestPageIndex((page) => page - 1)}>{translate("admin:concertWorkspacePage_trangTruoc")}</button>
              <span>{translate('pageNumber', { page: guestPageIndex + 1, total: guestSection.data.totalPages })}</span>
              <button type="button" className="admin-secondary-action" disabled={guestSection.data.last}
                onClick={() => setGuestPageIndex((page) => page + 1)}>{translate('pageNext')}</button>
            </div>
          ) : null}
        </section>
      ) : null}

      {tab === 'operations' ? (
        <section className="concert-workspace-grid">
          <section className="concert-workspace-card">
            <div className="concert-card-heading">
              <div>
                <span>{translate("admin:concertWorkspacePage_checkIn")}</span>
                <h2>{translate("admin:concertWorkspacePage_vanHanhTaiCong")}</h2>
              </div>
              {canViewOrders ? (
                <Link className="admin-secondary-action" to={`${root}/orders?concertId=${id}`}>{translate("admin:concertWorkspacePage_xemVe")}</Link>
              ) : null}
            </div>
            <SectionStatus {...checkinSection} />
            {checkin ? <dl className="concert-definition-list">
              <div>
                <dt>{translate("admin:concertWorkspacePage_tongVe")}</dt>
                <dd>{checkin.totalTickets}</dd>
              </div>
              <div>
                <dt>{translate("admin:concertWorkspacePage_daVaoCong")}</dt>
                <dd>{checkin.checkedIn}</dd>
              </div>
              <div>
                <dt>Online / Offline</dt>
                <dd>
                  {`${checkin.onlineCheckins} / ${checkin.offlineCheckins}`}
                </dd>
              </div>
            </dl> : null}
          </section>
          {canViewOrders ? (
            <section className="concert-workspace-card">
              <div className="concert-card-heading">
                <div>
                  <span>{translate("admin:concertWorkspacePage_donHang")}</span>
                  <h2>{orders ? translate("admin:concertWorkspacePage_donPhatSinh", { count: orders.length }) : translate("admin:concertWorkspacePage_donHang")}</h2>
                </div>
                <Link className="admin-secondary-action" to={`${root}/orders?concertId=${id}`}>
                  {translate("admin:concertWorkspacePage_xemDonHang")}
                </Link>
              </div>
              <SectionStatus {...orderSection} />
              {orders ? <dl className="concert-definition-list">
                <div>
                  <dt>{translate("admin:concertWorkspacePage_daThanhToan")}</dt>
                  <dd>{paidOrders.length}</dd>
                </div>
                <div>
                  <dt>{translate("admin:concertWorkspacePage_choThanhToan")}</dt>
                  <dd>{orders.filter((order) => order.status === 'AWAITING_PAYMENT').length}</dd>
                </div>
                <div>
                  <dt>{translate('revenue')}</dt>
                  <dd>{money.format(revenue)}</dd>
                </div>
              </dl> : null}
            </section>
          ) : null}
        </section>
      ) : null}

      {tab === 'artist' ? (
        <section className="concert-workspace-card artist-content-workspace">
          <SectionStatus {...artistSection} />
          <div className="concert-card-heading">
            <div>
              <span>{translate("admin:concertWorkspacePage_ngheSiNoiDungCongKhai")}</span>
              <h2>{translate("admin:concertWorkspacePage_bienTapTruocKhiXuatBan")}</h2>
            </div>
            <Link
              className="admin-secondary-action"
              to={`${root}/artist-bio?concertId=${id}&returnTo=${encodeURIComponent(`${root}/concerts/${id}?tab=artist`)}`}
            >
              {translate("admin:concertWorkspacePage_lichSuAiDayDu")}
            </Link>
          </div>
          <p className="artist-content-intro">
            {translate("admin:concertWorkspacePage_moiPdfTaoMotBanNhapNguon")}
          </p>
          <div className="artist-content-grid">
            <section>
              <div className="artist-content-section-heading">
                <div>
                  <strong>{translate("admin:concertWorkspacePage_nguonThamKhao")}</strong>
                  <span>{translate("admin:concertWorkspacePage_coTheThemNhieuPressKitHoac")}</span>
                </div>
                <label className="admin-primary-action">
                  <FileUp size={16} />
                  {uploadingArtistSources ? translate("admin:concertWorkspacePage_dangGui") : translate("admin:concertWorkspacePage_themTaiLieuPdf")}
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
                        aria-label={translate("admin:concertWorkspacePage_chonDeTongHop", { arg1: job.originalFileName })}
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
                        {translate("admin:concertWorkspacePage_xemRieng")}
                      </button>
                    ) : null}
                  </div>
                ))}
                {!artistJobs.length ? (
                  <p>{translate("admin:concertWorkspacePage_chuaCoTaiLieuNguonThemPress")}</p>
                ) : null}
              </div>
              <button
                className="admin-primary-action artist-combine-action"
                type="button"
                disabled={selectedArtistSourceIds.length < 2 || combiningArtistSources}
                onClick={() => void combineArtistSources()}
              >
                {combiningArtistSources
                  ? translate("admin:concertWorkspacePage_dangTongHop")
                  : translate("admin:concertWorkspacePage_tongHopNguonDaChon", { arg1: selectedArtistSourceIds.length })}
              </button>
            </section>
            <section className="artist-publish-panel">
              <div className="artist-content-section-heading">
                <div>
                  <strong>{translate("admin:concertWorkspacePage_noiDungSeHienThiCongKhai")}</strong>
                  <span>{translate("admin:concertWorkspacePage_khanGiaXemPhanNayTruocKhi")}</span>
                </div>
                <span
                  className={
                    concert.artistBio ? 'status-badge badge-success' : 'status-badge badge-muted'
                  }
                >
                  {concert.artistBio ? translate("admin:concertWorkspacePage_daXuatBan") : translate("admin:concertWorkspacePage_banNhap")}
                </span>
              </div>
              <textarea
                value={artistBioDraft}
                maxLength={2000}
                rows={9}
                onChange={(event) => setArtistBioDraft(event.target.value)}
                placeholder={translate("admin:concertWorkspacePage_tongHopCacNguonHoacTuViet")}
              />
              <div className="artist-publish-footer">
                <span>{artistBioDraft.length}{translate("admin:concertWorkspacePage_2000KyTu")}</span>
                <button
                  className="admin-primary-action"
                  type="button"
                  disabled={!artistBioDraft.trim() || publishingArtistBio}
                  onClick={() => void publishArtistBio()}
                >
                  {publishingArtistBio ? translate("admin:concertWorkspacePage_dangXuatBan") : translate("admin:concertWorkspacePage_xuatBanLenTrangConcert")}
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
  useTranslation();
  return (
    <button type="button" className="concert-workspace-metric" onClick={onOpen}>
      <span>{icon}</span>
      <small>{label}</small>
      <strong>{value}</strong>
      <em>{translate("admin:concertWorkspacePage_xemChiTiet")}</em>
    </button>
  );
}
