import { dateFormatter, numberFormatter } from '../../data/formatters';
import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { Edit3, Plus, Search, Ticket, Trash2, X } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  createTicketType,
  deleteTicketType,
  getAdminConcerts,
  getAdminTicketTypes,
  updateTicketType,
  updateTicketTypeStatus,
  type ManagementApiScope,
  type TicketTypeMutation,
} from '../../api/admin';
import type { ConcertDetail, TicketType as TicketTypeModel } from '../../api/concerts';
import { isRequestCanceled } from '../../api/client';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ConcertPicker } from '../../components/admin/ConcertPicker';
import { useToast } from '../../components/feedback/toast-context';
import { ModalPortal } from '../../components/feedback/ModalPortal';

const currency = numberFormatter({
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});

type TicketFormState = {
  name: string;
  price: string;
  totalQuantity: string;
  maxPerAccount: string;
  zoneColor: string;
};

const emptyForm: TicketFormState = {
  name: '',
  price: '',
  totalQuantity: '',
  maxPerAccount: '4',
  zoneColor: '#ff765f',
};

function formFromTicket(ticketType: TicketTypeModel): TicketFormState {
  return {
    name: ticketType.name,
    price: String(ticketType.price),
    totalQuantity: String(ticketType.totalQuantity),
    maxPerAccount: String(ticketType.maxPerAccount),
    zoneColor: ticketType.zoneColor || '#ff765f',
  };
}

function toPayload(form: TicketFormState): TicketTypeMutation {
  return {
    name: form.name.trim(),
    price: Number(form.price),
    totalQuantity: Number(form.totalQuantity),
    maxPerAccount: Number(form.maxPerAccount),
    zoneColor: form.zoneColor,
  };
}

export function AdminTicketTypesPage({ apiScope = 'admin' }: { apiScope?: ManagementApiScope }) {
  useTranslation();
  const toast = useToast();
  const [searchParams] = useSearchParams();
  const root = apiScope === 'admin' ? '/admin' : '/organizer';
  const returnTo = searchParams.get('returnTo');
  const safeReturnTo = returnTo?.startsWith(`${root}/concerts/`) ? returnTo : '';
  const [concerts, setConcerts] = useState<ConcertDetail[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState(
    () => searchParams.get('concertId') ?? '',
  );
  const [ticketTypes, setTicketTypes] = useState<TicketTypeModel[]>([]);
  const [loadingConcerts, setLoadingConcerts] = useState(true);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<TicketTypeModel | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TicketTypeModel | null>(null);
  const [form, setForm] = useState<TicketFormState>(emptyForm);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState('');
  const [query, setQuery] = useState('');
  const [availability, setAvailability] = useState<'all' | 'active' | 'paused' | 'sold'>('all');

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setLoadingConcerts(true);
      try {
        const data = await getAdminConcerts(0, 100, undefined, controller.signal, apiScope);
        setConcerts(data.content);
        setSelectedConcertId(
          (current) => current || searchParams.get('concertId') || data.content[0]?.id || '',
        );
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          setError(requestError instanceof Error ? requestError.message : translate("admin:adminTicketTypesPage_khongTheTaiConcert"));
        }
      } finally {
        if (!controller.signal.aborted) setLoadingConcerts(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [apiScope, searchParams]);

  const loadTicketTypes = useCallback(
    async (signal?: AbortSignal) => {
      if (!selectedConcertId) {
        setTicketTypes([]);
        return;
      }
      setLoadingTickets(true);
      setError('');
      try {
        setTicketTypes(await getAdminTicketTypes(selectedConcertId, signal, apiScope));
      } catch (requestError) {
        if (!isRequestCanceled(requestError)) {
          setError(requestError instanceof Error ? requestError.message : translate("admin:adminTicketTypesPage_khongTheTaiHangVe"));
        }
      } finally {
        if (!signal?.aborted) setLoadingTickets(false);
      }
    },
    [apiScope, selectedConcertId],
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadTicketTypes(controller.signal);
    return () => controller.abort();
  }, [loadTicketTypes]);

  const selectedConcert = useMemo(
    () => concerts.find((concert) => concert.id === selectedConcertId) ?? null,
    [concerts, selectedConcertId],
  );

  const totals = useMemo(
    () =>
      ticketTypes.reduce(
        (result, ticketType) => ({
          inventory: result.inventory + ticketType.totalQuantity,
          available: result.available + ticketType.availableQty,
        }),
        { inventory: 0, available: 0 },
      ),
    [ticketTypes],
  );

  const visibleTicketTypes = useMemo(() => {
    const keyword = query.trim().toLocaleLowerCase('vi');
    return ticketTypes.filter((ticketType) => {
      const matchesQuery = !keyword || ticketType.name.toLocaleLowerCase('vi').includes(keyword);
      const sold = ticketType.totalQuantity - ticketType.availableQty;
      const matchesAvailability =
        availability === 'all' ||
        (availability === 'active' && ticketType.isActive) ||
        (availability === 'paused' && !ticketType.isActive) ||
        (availability === 'sold' && sold > 0);
      return matchesQuery && matchesAvailability;
    });
  }, [availability, query, ticketTypes]);

  function openCreate() {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  }

  function openEdit(ticketType: TicketTypeModel) {
    setEditing(ticketType);
    setForm(formFromTicket(ticketType));
    setFormOpen(true);
  }

  async function submitForm(event: FormEvent) {
    event.preventDefault();
    if (!selectedConcertId) return;
    setSaving(true);
    try {
      const payload = toPayload(form);
      if (editing) {
        await updateTicketType(editing.id, payload, apiScope);
        toast.success(translate("admin:adminTicketTypesPage_daCapNhatHangVe"));
      } else {
        await createTicketType(selectedConcertId, payload, apiScope);
        toast.success(translate("admin:adminTicketTypesPage_daTaoHangVe"));
      }
      setFormOpen(false);
      await loadTicketTypes();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : translate("admin:adminTicketTypesPage_khongTheLuuHangVe"));
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(ticketType: TicketTypeModel) {
    setBusyId(ticketType.id);
    try {
      await updateTicketTypeStatus(ticketType.id, !ticketType.isActive, apiScope);
      const fallback = ticketType.isActive ? translate("admin:adminTicketTypesPage_daTamNgungHangVe") : translate("admin:adminTicketTypesPage_daKichHoatHangVe");
      toast.success(fallback);
      await loadTicketTypes();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : translate("admin:adminTicketTypesPage_khongTheDoiTrangThaiHangVe"),
      );
    } finally {
      setBusyId('');
    }
  }

  async function removeTicketType() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      await deleteTicketType(deleteTarget.id, apiScope);
      toast.success(translate("admin:adminTicketTypesPage_daXoaHangVe"));
      setDeleteTarget(null);
      await loadTicketTypes();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : translate("admin:adminTicketTypesPage_khongTheXoaHangVeDaPhat"),
      );
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={translate("admin:adminTicketTypesPage_tonKhoVe")}
        title={translate("admin:adminTicketTypesPage_quanLyHangVe")}
        description={translate("admin:adminTicketTypesPage_thietLapGiaHanMucMuaVa")}
        actions={
          <>
            {safeReturnTo ? (
              <Link className="admin-secondary-action" to={safeReturnTo}>
                {translate("admin:adminTicketTypesPage_quayVeConcert")}
              </Link>
            ) : null}
            <button
              className="admin-primary-action"
              type="button"
              onClick={openCreate}
              disabled={!selectedConcertId}
            >
              <Plus aria-hidden="true" size={17} />
              {translate("admin:adminTicketTypesPage_themHangVe")}
            </button>
          </>
        }
      />

      <div className="admin-concert-switcher admin-context-switcher">
        <ConcertPicker
          concerts={concerts}
          value={selectedConcertId}
          onChange={(id) => {
            setSelectedConcertId(id);
            setQuery('');
            setAvailability('all');
          }}
          label={translate("admin:adminTicketTypesPage_concertDangQuanLy")}
          disabled={loadingConcerts}
        />
        {selectedConcert ? (
          <div className="admin-context-summary">
            <span>{translate("admin:adminTicketTypesPage_thoiGianMoBan")}</span>
            <strong>
              {dateFormatter({ dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(selectedConcert.saleStartAt),
              )}
            </strong>
          </div>
        ) : null}
      </div>

      <section className="admin-inline-stats" aria-label={translate("admin:adminTicketTypesPage_tomTatHangVe")}>
        <div>
          <span>{translate("admin:adminTicketTypesPage_soHangVe")}</span>
          <strong>{ticketTypes.length}</strong>
        </div>
        <div>
          <span>{translate("admin:adminTicketTypesPage_tongTonKho")}</span>
          <strong>{totals.inventory}</strong>
        </div>
        <div>
          <span>{translate("admin:adminTicketTypesPage_conKhaDung")}</span>
          <strong>{totals.available}</strong>
        </div>
      </section>

      {error ? (
        <div className="admin-notice error" role="alert">
          {error}
        </div>
      ) : null}

      {ticketTypes.length ? (
        <div className="admin-toolbar ticket-type-toolbar">
          <label className="admin-search-control">
            <Search aria-hidden="true" size={16} />
            <span className="sr-only">{translate("admin:adminTicketTypesPage_timHangVe")}</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={translate("admin:adminTicketTypesPage_timTheoTenHangVe")}
            />
          </label>
          <label>
            <span className="sr-only">{translate("admin:adminTicketTypesPage_locTrangThaiHangVe")}</span>
            <select
              value={availability}
              onChange={(event) => setAvailability(event.target.value as typeof availability)}
            >
              <option value="all">{translate("admin:adminTicketTypesPage_tatCaHangVe")}</option>
              <option value="active">{translate("admin:adminTicketTypesPage_dangHoatDong")}</option>
              <option value="paused">{translate("admin:adminTicketTypesPage_tamNgung")}</option>
              <option value="sold">{translate("admin:adminTicketTypesPage_daPhatSinhBan")}</option>
            </select>
          </label>
          <span className="admin-filter-count">
            {translate("admin:adminTicketTypesPage_hienThi")} {visibleTicketTypes.length} / {ticketTypes.length}
          </span>
        </div>
      ) : null}

      <section className="admin-data-panel">
        {loadingTickets ? (
          <div className="admin-row-skeleton" aria-label={translate("admin:adminTicketTypesPage_dangTaiHangVe")} aria-live="polite">
            {[1, 2, 3].map((item) => (
              <span key={item} />
            ))}
          </div>
        ) : visibleTicketTypes.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{translate("admin:adminTicketTypesPage_hangVe")}</th>
                  <th>{translate("admin:adminTicketTypesPage_gia")}</th>
                  <th>{translate("admin:adminTicketTypesPage_tonKho")}</th>
                  <th>{translate("admin:adminTicketTypesPage_trangThai")}</th>
                  <th>
                    <span className="sr-only">{translate("admin:adminTicketTypesPage_thaoTac")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {visibleTicketTypes.map((ticketType) => {
                  const sold = ticketType.totalQuantity - ticketType.availableQty;
                  const editable = sold === 0;
                  return (
                    <tr key={ticketType.id}>
                      <td>
                        <div className="admin-ticket-name">
                          <i style={{ backgroundColor: ticketType.zoneColor }} />
                          <div>
                            <strong>{ticketType.name}</strong>
                            <span>{translate("admin:adminTicketTypesPage_toiDa")} {ticketType.maxPerAccount} {translate("admin:adminTicketTypesPage_veTaiKhoan")}</span>
                          </div>
                        </div>
                      </td>
                      <td>
                        <strong className="admin-table-primary">
                          {currency.format(ticketType.price)}
                        </strong>
                      </td>
                      <td>
                        <strong className="admin-table-primary">
                          {ticketType.availableQty} / {ticketType.totalQuantity}
                        </strong>
                        <span className="admin-table-secondary">{sold} {translate("admin:adminTicketTypesPage_daBan")}</span>
                      </td>
                      <td>
                        <button
                          className={`admin-toggle ${ticketType.isActive ? 'is-active' : ''}`}
                          type="button"
                          aria-pressed={ticketType.isActive}
                          onClick={() => void toggleStatus(ticketType)}
                          disabled={busyId === ticketType.id}
                        >
                          <span />
                          {ticketType.isActive ? translate("admin:adminTicketTypesPage_dangHoatDong") : translate("admin:adminTicketTypesPage_tamNgung")}
                        </button>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            aria-label={translate("admin:adminTicketTypesPage_sua", { arg1: ticketType.name })}
                            disabled={!editable || busyId === ticketType.id}
                            onClick={() => openEdit(ticketType)}
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={translate("admin:adminTicketTypesPage_xoa", { arg1: ticketType.name })}
                            disabled={!editable || busyId === ticketType.id}
                            onClick={() => setDeleteTarget(ticketType)}
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <Ticket aria-hidden="true" size={28} />
            <h2>
              {ticketTypes.length
                ? translate("admin:adminTicketTypesPage_khongCoHangVePhuHop")
                : selectedConcertId
                  ? translate("admin:adminTicketTypesPage_concertChuaCoHangVe")
                  : translate("admin:adminTicketTypesPage_chuaCoConcertDeQuanLy")}
            </h2>
            <p>
              {ticketTypes.length
                ? translate("admin:adminTicketTypesPage_thuDoiTuKhoaHoacBoLoc")
                : selectedConcertId
                  ? translate("admin:adminTicketTypesPage_taoHangVeDauTienDeChuan")
                  : translate("admin:adminTicketTypesPage_taoConcertTruocSauDoQuayLai")}
            </p>
            {ticketTypes.length ? (
              <button
                className="admin-secondary-action"
                type="button"
                onClick={() => {
                  setQuery('');
                  setAvailability('all');
                }}
              >
                {translate("admin:adminTicketTypesPage_xoaBoLoc")}
              </button>
            ) : selectedConcertId ? (
              <button className="admin-primary-action" type="button" onClick={openCreate}>
                {translate("admin:adminTicketTypesPage_themHangVe")}
              </button>
            ) : null}
          </div>
        )}
      </section>

      {formOpen ? (
        <TicketTypeForm
          form={form}
          editing={editing}
          saving={saving}
          onChange={setForm}
          onClose={() => setFormOpen(false)}
          onSubmit={submitForm}
        />
      ) : null}

      {deleteTarget ? (
        <AdminConfirmDialog
          title={translate("admin:adminTicketTypesPage_xoaHangVe", { arg1: deleteTarget.name })}
          description={translate("admin:adminTicketTypesPage_hangVeSeBiXoaVinhVien")}
          confirmLabel={translate("admin:adminTicketTypesPage_xoaHangVe_2")}
          loading={busyId === deleteTarget.id}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => void removeTicketType()}
        />
      ) : null}
    </>
  );
}

function TicketTypeForm({
  form,
  editing,
  saving,
  onChange,
  onClose,
  onSubmit,
}: {
  form: TicketFormState;
  editing: TicketTypeModel | null;
  saving: boolean;
  onChange: (form: TicketFormState) => void;
  onClose: () => void;
  onSubmit: (event: FormEvent) => void;
}) {
  useTranslation();
  const field = (name: keyof TicketFormState) => ({
    value: form[name],
    onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
      onChange({ ...form, [name]: event.target.value }),
  });

  return (
    <ModalPortal>
      <div className="admin-dialog-backdrop" role="presentation">
      <section
        className="admin-dialog admin-dialog-compact"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ticket-form-title"
      >
        <header>
          <div>
            <span>{translate("admin:adminTicketTypesPage_tonKhoVe")}</span>
            <h2 id="ticket-form-title">{editing ? translate("admin:adminTicketTypesPage_sua", { arg1: editing.name }) : translate("admin:adminTicketTypesPage_themHangVe")}</h2>
          </div>
          <button type="button" aria-label={translate("admin:adminTicketTypesPage_dong")} onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="admin-form-grid">
            <label className="admin-field admin-field-wide">
              <span>{translate("admin:adminTicketTypesPage_tenHangVe")}</span>
              <input required maxLength={100} {...field('name')} />
            </label>
            <label className="admin-field">
              <span>{translate("admin:adminTicketTypesPage_giaVe")}</span>
              <input
                required
                min="0"
                step="1000"
                type="number"
                inputMode="numeric"
                {...field('price')}
              />
            </label>
            <label className="admin-field">
              <span>{translate("admin:adminTicketTypesPage_mauVung")}</span>
              <span className="admin-color-field">
                <input type="color" {...field('zoneColor')} />
                <input required pattern="^#[A-Fa-f0-9]{6}$" {...field('zoneColor')} />
              </span>
            </label>
            <label className="admin-field">
              <span>{translate("admin:adminTicketTypesPage_tongSoLuong")}</span>
              <input
                required
                min="1"
                type="number"
                inputMode="numeric"
                {...field('totalQuantity')}
              />
            </label>
            <label className="admin-field">
              <span>{translate("admin:adminTicketTypesPage_toiDaMoiTaiKhoan")}</span>
              <input
                required
                min="1"
                type="number"
                inputMode="numeric"
                {...field('maxPerAccount')}
              />
            </label>
          </div>
          <footer>
            <button className="admin-secondary-action" type="button" onClick={onClose}>
              {translate("admin:adminTicketTypesPage_huy")}
            </button>
            <button className="admin-primary-action" type="submit" disabled={saving}>
              {saving ? translate("admin:adminTicketTypesPage_dangLuu") : editing ? translate("admin:adminTicketTypesPage_luuThayDoi") : translate("admin:adminTicketTypesPage_taoHangVe")}
            </button>
          </footer>
        </form>
      </section>
      </div>
    </ModalPortal>
  );
}
