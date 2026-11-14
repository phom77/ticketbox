import { dateFormatter } from '../../data/formatters';
import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { ConcertTextFields } from '../../features/concert/ConcertTextFields';
import { editConcertText } from '../../features/concert/concertText';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  CalendarPlus,
  ChevronLeft,
  ChevronRight,
  Edit3,
  ExternalLink,
  MapPin,
  ImagePlus,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  Map,
} from 'lucide-react';
import DOMPurify from 'dompurify';
import { Link, useSearchParams } from 'react-router-dom';
import {
  createConcert,
  deleteConcert,
  getAdminCheckinSummary,
  getAdminConcerts,
  removeConcertPoster,
  uploadConcertPoster,
  updateConcert,
  updateConcertStatus,
  type CheckinSummary,
  type ConcertMutation,
  type ManagementApiScope,
} from '../../api/admin';
import type { ConcertDetail, ConcertStatus, Page } from '../../api/concerts';
import { isRequestCanceled } from '../../api/client';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ActionMenu } from '../../components/admin/ActionMenu';
import { useToast } from '../../components/feedback/toast-context';
import { ModalPortal } from '../../components/feedback/ModalPortal';

const statuses: Array<{ value: '' | ConcertStatus; label: string }> = [
  { value: '', get label() { return translate("admin:adminConcertsPage_tatCaTrangThai"); } },
  { value: 'DRAFT', get label() { return translate("admin:adminConcertsPage_banNhap"); } },
  { value: 'ON_SALE', get label() { return translate("admin:adminConcertsPage_dangBan"); } },
  { value: 'SOLD_OUT', get label() { return translate("admin:adminConcertsPage_hetVe"); } },
  { value: 'COMPLETED', get label() { return translate("admin:adminConcertsPage_daKetThuc"); } },
  { value: 'CANCELLED', get label() { return translate("admin:adminConcertsPage_daHuy"); } },
];

const transitions: Record<ConcertStatus, ConcertStatus[]> = {
  DRAFT: ['ON_SALE', 'CANCELLED'],
  ON_SALE: ['SOLD_OUT', 'COMPLETED', 'CANCELLED'],
  SOLD_OUT: ['ON_SALE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
};

const dateTime = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
});

type ConcertFormState = {
  original?: ConcertMutation['original'];
  translations: NonNullable<ConcertMutation['translations']>;
  venueName: string;
  venueAddress: string;
  eventDate: string;
  doorsOpenAt: string;
  saleStartAt: string;
  saleEndAt: string;
  seatMapSvg: string;
};

const emptyForm: ConcertFormState = {
  translations: {},
  venueName: '',
  venueAddress: '',
  eventDate: '',
  doorsOpenAt: '',
  saleStartAt: '',
  saleEndAt: '',
  seatMapSvg: '',
};

function toLocalInput(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function formFromConcert(concert: ConcertDetail): ConcertFormState {
  return {
    ...editConcertText(concert),
    venueName: concert.venueName,
    venueAddress: concert.venueAddress,
    eventDate: toLocalInput(concert.eventDate),
    doorsOpenAt: toLocalInput(concert.doorsOpenAt),
    saleStartAt: toLocalInput(concert.saleStartAt),
    saleEndAt: toLocalInput(concert.saleEndAt),
    seatMapSvg: concert.seatMapSvg ?? '',
  };
}

function toPayload(form: ConcertFormState): ConcertMutation {
  return {
    title: '',
    description: null,
    original: form.original,
    translations: form.translations,
    venueName: form.venueName.trim(),
    venueAddress: form.venueAddress.trim(),
    eventDate: new Date(form.eventDate).toISOString(),
    doorsOpenAt: form.doorsOpenAt ? new Date(form.doorsOpenAt).toISOString() : null,
    saleStartAt: new Date(form.saleStartAt).toISOString(),
    saleEndAt: form.saleEndAt ? new Date(form.saleEndAt).toISOString() : null,
    seatMapSvg: form.seatMapSvg.trim() || null,
  };
}

function statusLabel(status: ConcertStatus) {
  return statuses.find((item) => item.value === status)?.label ?? status;
}

export function AdminConcertsPage({ apiScope = 'admin' }: { apiScope?: ManagementApiScope }) {
  useTranslation();
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [pageData, setPageData] = useState<Page<ConcertDetail> | null>(null);
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<'' | ConcertStatus>('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState<ConcertDetail | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ConcertDetail | null>(null);
  const [formOpen, setFormOpen] = useState(searchParams.get('create') === '1');
  const [form, setForm] = useState<ConcertFormState>(emptyForm);
  const [posterFile, setPosterFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [removingPoster, setRemovingPoster] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [checkinSummaries, setCheckinSummaries] = useState<Record<string, CheckinSummary>>({});

  const loadConcerts = useCallback(
    async (signal?: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        setPageData(await getAdminConcerts(page, 10, status || undefined, signal, apiScope, query));
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          setError(
            requestError instanceof Error
              ? requestError.message
              : translate("admin:adminConcertsPage_khongTheTaiDanhSachConcert"),
          );
        }
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [apiScope, page, query, status],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadConcerts(controller.signal);
    return () => controller.abort();
  }, [loadConcerts]);

  useEffect(() => {
    if (apiScope !== 'admin' || !pageData?.content.length) {
      setCheckinSummaries({});
      return;
    }

    const controller = new AbortController();
    Promise.allSettled(
      pageData.content.map((concert) => getAdminCheckinSummary(concert.id, controller.signal)),
    ).then((results) => {
      if (controller.signal.aborted) return;
      const next: Record<string, CheckinSummary> = {};
      results.forEach((result) => {
        if (result.status === 'fulfilled') next[result.value.concertId] = result.value;
      });
      setCheckinSummaries(next);
    });

    return () => controller.abort();
  }, [apiScope, pageData?.content]);

  useEffect(() => {
    if (searchParams.get('create') === '1') {
      setEditing(null);
      setForm(emptyForm);
      setFormOpen(true);
    }
  }, [searchParams]);

  const filteredConcerts = pageData?.content ?? [];
  const availableTransitions = (concert: ConcertDetail) => transitions[concert.status].filter(
    (next) => apiScope === 'admin' || (next !== 'CANCELLED' && !(concert.status === 'DRAFT' && next === 'ON_SALE')),
  );

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setPosterFile(null);
    setFormOpen(true);
  }

  function openEdit(concert: ConcertDetail) {
    setEditing(concert);
    setForm(formFromConcert(concert));
    setPosterFile(null);
    setFormOpen(true);
  }

  function closeForm() {
    setFormOpen(false);
    setPosterFile(null);
    setSearchParams({}, { replace: true });
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    setSaving(true);
    try {
      const payload = toPayload(form);
      const result = editing
        ? await updateConcert(editing.id, payload, apiScope)
        : await createConcert(payload, apiScope);

      if (posterFile) {
        try {
          await uploadConcertPoster(result.data.id, posterFile, apiScope);
        } catch (uploadError) {
          closeForm();
          await loadConcerts();
          toast.error(
            uploadError instanceof Error
              ? translate("admin:adminConcertsPage_concertDaDuocLuuNhungPosterChua", { arg1: uploadError.message })
              : translate("admin:adminConcertsPage_concertDaDuocLuuNhungPosterChua_2"),
          );
          return;
        }
      }

      toast.success(
        editing ? translate("admin:adminConcertsPage_daCapNhatConcert") : translate("admin:adminConcertsPage_daTaoConcertOTrangThaiBan"),
      );
      closeForm();
      await loadConcerts();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : translate("admin:adminConcertsPage_khongTheLuuConcert"));
    } finally {
      setSaving(false);
    }
  }

  function choosePoster(file: File | null) {
    if (!file) {
      setPosterFile(null);
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      toast.error(translate("admin:adminConcertsPage_posterPhaiLaAnhJpegPngHoac"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error(translate("admin:adminConcertsPage_posterKhongDuocVuotQua5Mb"));
      return;
    }
    setPosterFile(file);
  }

  async function removePoster() {
    if (!editing?.posterUrl) return;
    setRemovingPoster(true);
    try {
      const result = await removeConcertPoster(editing.id, apiScope);
      setEditing(result.data);
      toast.success(result.message || translate("admin:adminConcertsPage_daXoaPosterConcert"));
      await loadConcerts();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : translate("admin:adminConcertsPage_khongTheXoaPosterConcert"),
      );
    } finally {
      setRemovingPoster(false);
    }
  }

  async function changeStatus(concert: ConcertDetail, next: ConcertStatus) {
    setBusyId(concert.id);
    try {
      await updateConcertStatus(concert.id, next, apiScope);
      toast.success(
        translate("admin:adminConcertsPage_daChuyenSang", { arg1: concert.title, arg2: statusLabel(next) }),
      );
      await loadConcerts();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : translate("admin:adminConcertsPage_khongTheDoiTrangThaiConcert"),
      );
    } finally {
      setBusyId('');
    }
  }

  async function removeConcert() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteConcert(deleteTarget.id, apiScope);
      toast.success(translate("admin:adminConcertsPage_daXoaConcert"));
      setDeleteTarget(null);
      await loadConcerts();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate("admin:adminConcertsPage_chiConcertBanNhapMoiCoThe"),
      );
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={translate("admin:adminConcertsPage_lichChuongTrinh")}
        title={translate("admin:adminConcertsPage_quanLyConcert")}
        description={translate("admin:adminConcertsPage_taoChuongTrinhKiemSoatNoiDung")}
        actions={
          <button className="admin-primary-action" type="button" onClick={openCreate}>
            <Plus aria-hidden="true" size={17} />
            {translate("admin:adminConcertsPage_taoConcert")}
          </button>
        }
      />

      <section className="admin-inline-stats" aria-label={translate("admin:adminConcertsPage_tomTatConcert")}>
        <div><span>{translate("admin:adminConcertsPage_buoiDienPhuHop")}</span><strong>{pageData?.totalElements ?? '—'}</strong></div>
      </section>

      <div className="admin-toolbar">
        <label className="admin-search-control">
          <Search aria-hidden="true" size={16} />
          <span className="sr-only">{translate("admin:adminConcertsPage_timConcert")}</span>
          <input
            type="search"
            value={query}
            onChange={(event) => { setQuery(event.target.value); setPage(0); }}
            placeholder={translate("admin:adminConcertsPage_timConcertDiaDiem")}
          />
        </label>
        <label>
          <span className="sr-only">{translate("admin:adminConcertsPage_locTheoTrangThai")}</span>
          <select
            value={status}
            onChange={(event) => {
              setStatus(event.target.value as '' | ConcertStatus);
              setPage(0);
            }}
          >
            {statuses.map((item) => (
              <option key={item.value || 'all'} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>
        <button type="button" onClick={() => void loadConcerts()} disabled={loading}>
          <RefreshCw aria-hidden="true" size={16} />
          {translate("admin:adminConcertsPage_lamMoi")}
        </button>
      </div>

      {error ? (
        <div className="admin-notice error" role="alert">
          {error}
        </div>
      ) : null}

      <section className="admin-data-panel">
        {loading ? (
          <ConcertRowsSkeleton />
        ) : filteredConcerts.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{translate('event')}</th>
                  {apiScope === 'admin' ? <th>{translate("admin:adminConcertsPage_checkIn")}</th> : null}
                  <th>{translate("admin:adminConcertsPage_thoiGian")}</th>
                  <th>{translate("admin:adminConcertsPage_trangThai")}</th>
                  <th>{translate("admin:adminConcertsPage_dieuPhoi")}</th>
                  <th>
                    <span className="sr-only">{translate("admin:adminConcertsPage_thaoTac")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredConcerts.map((concert) => (
                  <tr key={concert.id}>
                    <td>
                      <div className="admin-concert-cell">
                        <div className="admin-concert-poster">
                          {concert.posterUrl ? (
                            <img src={concert.posterUrl} alt="" />
                          ) : (
                            <CalendarPlus size={20} />
                          )}
                        </div>
                        <div>
                          <strong>{concert.title}</strong>
                          <span>
                            <MapPin size={13} />
                            {concert.venueName}
                          </span>
                        </div>
                      </div>
                    </td>
                    {apiScope === 'admin' ? (
                      <td>
                        {checkinSummaries[concert.id] ? (
                          <>
                            <strong className="admin-table-primary">
                              {checkinSummaries[concert.id].checkedIn} /{' '}
                              {checkinSummaries[concert.id].totalTickets}
                            </strong>
                            <span className="admin-table-secondary">
                              Online {checkinSummaries[concert.id].onlineCheckins} · Offline{' '}
                              {checkinSummaries[concert.id].offlineCheckins}
                            </span>
                          </>
                        ) : (
                          <span className="admin-table-secondary">{translate("admin:adminConcertsPage_dangTongHop")}</span>
                        )}
                      </td>
                    ) : null}
                    <td>
                      <strong className="admin-table-primary">
                        {dateTime.format(new Date(concert.eventDate))}
                      </strong>
                      <span className="admin-table-secondary">
                        {translate("admin:adminConcertsPage_banVe")} {dateTime.format(new Date(concert.saleStartAt))}
                      </span>
                      <span className="admin-table-secondary">
                        {concert.saleEndAt
                          ? translate("admin:adminConcertsPage_den", { arg1: dateTime.format(new Date(concert.saleEndAt)) })
                          : translate("admin:adminConcertsPage_denKhiConcertDienRa")}
                      </span>
                    </td>
                    <td>
                      <span className={`admin-status status-${concert.status.toLowerCase()}`}>
                        {apiScope === 'organizer' && concert.status === 'ON_SALE' ? translate("admin:adminConcertsPage_daCauHinhMoBan") : statusLabel(concert.status)}
                      </span>
                    </td>
                    <td>
                      <ActionMenu
                        label={translate("admin:adminConcertsPage_chuyenTrangThai")}
                        ariaLabel={translate("admin:adminConcertsPage_doiTrangThai", { arg1: concert.title })}
                        disabled={!availableTransitions(concert).length || busyId === concert.id}
                        options={availableTransitions(concert).map((next) => ({
                          value: next,
                          label: statusLabel(next),
                          destructive: next === 'CANCELLED',
                        }))}
                        onSelect={(next) => void changeStatus(concert, next)}
                      />
                    </td>
                    <td>
                      <div className="admin-row-actions">
                        <Link
                          className="admin-row-link"
                          aria-label={translate("admin:adminConcertsPage_moKhongGianQuanLy", { arg1: concert.title })}
                          to={`${apiScope === 'admin' ? '/admin' : '/organizer'}/concerts/${concert.id}`}
                        >
                          <ExternalLink size={16} />
                        </Link>
                        <button
                          type="button"
                          aria-label={translate("admin:adminConcertsPage_sua", { arg1: concert.title })}
                          onClick={() => openEdit(concert)}
                          disabled={
                            busyId === concert.id ||
                            ['COMPLETED', 'CANCELLED'].includes(concert.status)
                          }
                        >
                          <Edit3 size={16} />
                        </button>
                        <button
                          type="button"
                          aria-label={translate("admin:adminConcertsPage_xoa", { arg1: concert.title })}
                          onClick={() => setDeleteTarget(concert)}
                          disabled={concert.status !== 'DRAFT' || busyId === concert.id}
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
            <CalendarPlus aria-hidden="true" size={28} />
            <h2>{translate("admin:adminConcertsPage_chuaCoConcertPhuHop")}</h2>
            <p>
              {query.trim()
                ? translate("admin:adminConcertsPage_thuDoiTuKhoaTimKiemHoac")
                : translate("admin:adminConcertsPage_thayDoiBoLocHoacTaoConcert")}
            </p>
            <button className="admin-primary-action" type="button" onClick={openCreate}>
              {translate("admin:adminConcertsPage_taoConcert")}
            </button>
          </div>
        )}
      </section>

      {pageData && pageData.totalPages > 1 ? (
        <div className="admin-pagination">
          <span>
            {translate('pageNumber', { page: pageData.number + 1, total: pageData.totalPages })}
          </span>
          <div>
            <button
              type="button"
              aria-label={translate("admin:adminConcertsPage_trangTruoc")}
              disabled={pageData.first}
              onClick={() => setPage((value) => value - 1)}
            >
              <ChevronLeft size={17} />
            </button>
            <button
              type="button"
              aria-label={translate('pageNext')}
              disabled={pageData.last}
              onClick={() => setPage((value) => value + 1)}
            >
              <ChevronRight size={17} />
            </button>
          </div>
        </div>
      ) : null}

      {formOpen ? (
        <ConcertForm
          form={form}
          editing={editing}
          saving={saving}
          removingPoster={removingPoster}
          posterFile={posterFile}
          onChange={setForm}
          onPosterChange={choosePoster}
          onRemovePoster={() => void removePoster()}
          onClose={closeForm}
          onSubmit={submitForm}
        />
      ) : null}

      {deleteTarget ? (
        <AdminConfirmDialog
          title={translate("admin:adminConcertsPage_xoaConcert", { arg1: deleteTarget.title })}
          description={translate("admin:adminConcertsPage_concertBanNhapVaToanBoCau")}
          confirmLabel={translate("admin:adminConcertsPage_xoaConcert_2")}
          loading={busyId === deleteTarget.id}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void removeConcert()}
        />
      ) : null}
    </>
  );
}

function ConcertRowsSkeleton() {
  useTranslation();
  return (
    <div className="admin-row-skeleton" aria-label={translate("admin:adminConcertsPage_dangTaiConcert")} aria-live="polite">
      {[1, 2, 3, 4].map((item) => (
        <span key={item} />
      ))}
    </div>
  );
}

function ConcertForm({
  form,
  editing,
  saving,
  removingPoster,
  posterFile,
  onChange,
  onPosterChange,
  onRemovePoster,
  onClose,
  onSubmit,
}: {
  form: ConcertFormState;
  editing: ConcertDetail | null;
  saving: boolean;
  removingPoster: boolean;
  posterFile: File | null;
  onChange: (form: ConcertFormState) => void;
  onPosterChange: (file: File | null) => void;
  onRemovePoster: () => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  useTranslation();
  const toast = useToast();
  const [selectedPosterPreview, setSelectedPosterPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!posterFile) {
      setSelectedPosterPreview(null);
      return;
    }
    const objectUrl = URL.createObjectURL(posterFile);
    setSelectedPosterPreview(objectUrl);
    return () => {
      URL.revokeObjectURL(objectUrl);
    };
  }, [posterFile]);

  const posterPreview = selectedPosterPreview ?? editing?.posterUrl ?? null;

  const field = (name: Exclude<keyof ConcertFormState, 'original' | 'translations'>) => ({
    value: form[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onChange({ ...form, [name]: event.target.value }),
  });

  const handleSvgUpload = (file: File | null) => {
    if (!file) {
      return;
    }
    if (file.type !== 'image/svg+xml') {
      toast.error(translate("admin:adminConcertsPage_vuiLongChonFileSvgHopLe"));
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error(translate("admin:adminConcertsPage_fileSvgKhongDuocVuotQua2"));
      return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
      const text = e.target?.result as string;
      const sanitized = DOMPurify.sanitize(text, {
        USE_PROFILES: { svg: true, svgFilters: true },
      });
      onChange({ ...form, seatMapSvg: sanitized });
    };
    reader.readAsText(file);
  };

  const dialog = (
    <div className="admin-dialog-backdrop" role="presentation">
      <section
        className="admin-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="concert-form-title"
      >
        <header>
          <div>
            <span>{editing ? translate("admin:adminConcertsPage_chinhSuaChuongTrinh") : translate("admin:adminConcertsPage_chuongTrinhMoi")}</span>
            <h2 id="concert-form-title">{editing ? editing.title : translate("admin:adminConcertsPage_taoConcert")}</h2>
          </div>
          <button type="button" aria-label={translate("admin:adminConcertsPage_dong")} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="admin-form-grid">
            <ConcertTextFields original={form.original} translations={form.translations}
              onChange={(text) => onChange({ ...form, ...text })} />
            <label className="admin-field">
              <span>{translate("admin:adminConcertsPage_thoiGianDienRa")}</span>
              <input required type="datetime-local" {...field('eventDate')} />
            </label>
            <label className="admin-field">
              <span>{translate("admin:adminConcertsPage_gioMoCua")}</span>
              <input type="datetime-local" {...field('doorsOpenAt')} />
            </label>
            <label className="admin-field">
              <span>{translate("admin:adminConcertsPage_batDauBanVe")}</span>
              <input required type="datetime-local" {...field('saleStartAt')} />
            </label>
            <label className="admin-field">
              <span>{translate("admin:adminConcertsPage_ketThucBanVe")}</span>
              <input type="datetime-local" {...field('saleEndAt')} />
            </label>
            <label className="admin-field">
              <span>{translate("admin:adminConcertsPage_diaDiem")}</span>
              <input required {...field('venueName')} />
            </label>
            <label className="admin-field">
              <span>{translate("admin:adminConcertsPage_diaChi")}</span>
              <input required {...field('venueAddress')} />
            </label>
            <div className="admin-field admin-field-wide">
              <span>{translate('eventPoster')}</span>
              <div className="admin-poster-field">
                <div className="admin-poster-preview">
                  {posterPreview ? (
                    <img src={posterPreview} alt={translate("admin:adminConcertsPage_xemTruocPosterConcert")} />
                  ) : (
                    <ImagePlus aria-hidden="true" size={25} />
                  )}
                </div>
                <div className="admin-poster-controls">
                  <label className="admin-secondary-action">
                    <ImagePlus aria-hidden="true" size={16} />
                    {posterPreview ? translate("admin:adminConcertsPage_doiPoster") : translate("admin:adminConcertsPage_chonPoster")}
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      onChange={(event) => onPosterChange(event.target.files?.[0] ?? null)}
                    />
                  </label>
                  {posterFile ? (
                    <button
                      className="admin-secondary-action"
                      type="button"
                      onClick={() => onPosterChange(null)}
                    >
                      {translate("admin:adminConcertsPage_boAnhDaChon")}
                    </button>
                  ) : editing?.posterUrl ? (
                    <button
                      className="admin-secondary-action"
                      type="button"
                      onClick={onRemovePoster}
                      disabled={removingPoster}
                    >
                      {removingPoster ? translate("admin:adminConcertsPage_dangXoa") : translate("admin:adminConcertsPage_xoaPoster")}
                    </button>
                  ) : null}
                  <small>{translate("admin:adminConcertsPage_jpegPngHoacWebpToiDa5")}</small>
                </div>
              </div>
            </div>
            <div className="admin-field admin-field-wide">
              <span>{translate("admin:adminConcertsPage_soDoChoSvg")}</span>
              <div className="admin-poster-field">
                <div className="admin-poster-preview">
                  {form.seatMapSvg ? (
                    <div
                      style={{
                        width: '100%',
                        height: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                      dangerouslySetInnerHTML={{ __html: form.seatMapSvg }}
                    />
                  ) : (
                    <Map aria-hidden="true" size={25} />
                  )}
                </div>
                <div className="admin-poster-controls">
                  <label className="admin-secondary-action">
                    <Map aria-hidden="true" size={16} />
                    {form.seatMapSvg ? translate("admin:adminConcertsPage_doiSoDo") : translate("admin:adminConcertsPage_chonSoDoSvg")}
                    <input
                      type="file"
                      accept=".svg,image/svg+xml"
                      onChange={(event) => {
                        handleSvgUpload(event.target.files?.[0] ?? null);
                        event.target.value = ''; // Reset input to allow re-uploading the same file
                      }}
                    />
                  </label>
                  {form.seatMapSvg ? (
                    <button
                      className="admin-secondary-action"
                      type="button"
                      onClick={() => onChange({ ...form, seatMapSvg: '' })}
                    >
                      {translate("admin:adminConcertsPage_xoaSoDo")}
                    </button>
                  ) : null}
                  <small>{translate("admin:adminConcertsPage_dinhDangSvgToiDa2Mb")}</small>
                </div>
              </div>
            </div>
          </div>
          <footer>
            <button className="admin-secondary-action" type="button" onClick={onClose}>
              {translate("admin:adminConcertsPage_huy")}
            </button>
            <button className="admin-primary-action" type="submit" disabled={saving}>
              {saving ? translate("admin:adminConcertsPage_dangLuu") : editing ? translate("admin:adminConcertsPage_luuThayDoi") : translate("admin:adminConcertsPage_taoBanNhap")}
            </button>
          </footer>
        </form>
      </section>
    </div>
  );

  return <ModalPortal>{dialog}</ModalPortal>;
}
