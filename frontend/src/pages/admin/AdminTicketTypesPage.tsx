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
import { commandMessage, isRequestCanceled } from '../../api/client';
import { AdminConfirmDialog } from '../../components/admin/AdminConfirmDialog';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ConcertPicker } from '../../components/admin/ConcertPicker';
import { useToast } from '../../components/feedback/toast-context';
import { ModalPortal } from '../../components/feedback/ModalPortal';

const currency = new Intl.NumberFormat('vi-VN', {
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
          setError(requestError instanceof Error ? requestError.message : 'Không thể tải concert.');
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
          setError(requestError instanceof Error ? requestError.message : 'Không thể tải hạng vé.');
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
        const result = await updateTicketType(editing.id, payload, apiScope);
        toast.success(commandMessage(result.message, 'Đã cập nhật hạng vé.'));
      } else {
        const result = await createTicketType(selectedConcertId, payload, apiScope);
        toast.success(commandMessage(result.message, 'Đã tạo hạng vé.'));
      }
      setFormOpen(false);
      await loadTicketTypes();
    } catch (requestError) {
      toast.error(requestError instanceof Error ? requestError.message : 'Không thể lưu hạng vé.');
    } finally {
      setSaving(false);
    }
  }

  async function toggleStatus(ticketType: TicketTypeModel) {
    setBusyId(ticketType.id);
    try {
      const result = await updateTicketTypeStatus(ticketType.id, !ticketType.isActive, apiScope);
      const fallback = ticketType.isActive ? 'Đã tạm ngưng hạng vé.' : 'Đã kích hoạt hạng vé.';
      toast.success(commandMessage(result.message, fallback));
      await loadTicketTypes();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error ? requestError.message : 'Không thể đổi trạng thái hạng vé.',
      );
    } finally {
      setBusyId('');
    }
  }

  async function removeTicketType() {
    if (!deleteTarget) return;
    setBusyId(deleteTarget.id);
    try {
      const result = await deleteTicketType(deleteTarget.id, apiScope);
      toast.success(commandMessage(result.message, 'Đã xóa hạng vé.'));
      setDeleteTarget(null);
      await loadTicketTypes();
    } catch (requestError) {
      toast.error(
        requestError instanceof Error
          ? requestError.message
          : 'Không thể xóa hạng vé đã phát sinh bán.',
      );
    } finally {
      setBusyId('');
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Tồn kho vé"
        title="Quản lý hạng vé"
        description="Thiết lập giá, hạn mức mua và tồn kho cho từng concert."
        actions={
          <>
            {safeReturnTo ? (
              <Link className="admin-secondary-action" to={safeReturnTo}>
                Quay về concert
              </Link>
            ) : null}
            <button
              className="admin-primary-action"
              type="button"
              onClick={openCreate}
              disabled={!selectedConcertId}
            >
              <Plus aria-hidden="true" size={17} />
              Thêm hạng vé
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
          label="Concert đang quản lý"
          disabled={loadingConcerts}
        />
        {selectedConcert ? (
          <div className="admin-context-summary">
            <span>Thời gian mở bán</span>
            <strong>
              {new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' }).format(
                new Date(selectedConcert.saleStartAt),
              )}
            </strong>
          </div>
        ) : null}
      </div>

      <section className="admin-inline-stats" aria-label="Tóm tắt hạng vé">
        <div>
          <span>Số hạng vé</span>
          <strong>{ticketTypes.length}</strong>
        </div>
        <div>
          <span>Tổng tồn kho</span>
          <strong>{totals.inventory}</strong>
        </div>
        <div>
          <span>Còn khả dụng</span>
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
            <span className="sr-only">Tìm hạng vé</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Tìm theo tên hạng vé..."
            />
          </label>
          <label>
            <span className="sr-only">Lọc trạng thái hạng vé</span>
            <select
              value={availability}
              onChange={(event) => setAvailability(event.target.value as typeof availability)}
            >
              <option value="all">Tất cả hạng vé</option>
              <option value="active">Đang hoạt động</option>
              <option value="paused">Tạm ngưng</option>
              <option value="sold">Đã phát sinh bán</option>
            </select>
          </label>
          <span className="admin-filter-count">
            Hiển thị {visibleTicketTypes.length} / {ticketTypes.length}
          </span>
        </div>
      ) : null}

      <section className="admin-data-panel">
        {loadingTickets ? (
          <div className="admin-row-skeleton" aria-label="Đang tải hạng vé" aria-live="polite">
            {[1, 2, 3].map((item) => (
              <span key={item} />
            ))}
          </div>
        ) : visibleTicketTypes.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>Hạng vé</th>
                  <th>Giá</th>
                  <th>Tồn kho</th>
                  <th>Trạng thái</th>
                  <th>
                    <span className="sr-only">Thao tác</span>
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
                            <span>Tối đa {ticketType.maxPerAccount} vé / tài khoản</span>
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
                        <span className="admin-table-secondary">{sold} đã bán</span>
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
                          {ticketType.isActive ? 'Đang hoạt động' : 'Tạm ngưng'}
                        </button>
                      </td>
                      <td>
                        <div className="admin-row-actions">
                          <button
                            type="button"
                            aria-label={`Sửa ${ticketType.name}`}
                            disabled={!editable || busyId === ticketType.id}
                            onClick={() => openEdit(ticketType)}
                          >
                            <Edit3 size={16} />
                          </button>
                          <button
                            type="button"
                            aria-label={`Xóa ${ticketType.name}`}
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
                ? 'Không có hạng vé phù hợp'
                : selectedConcertId
                  ? 'Concert chưa có hạng vé'
                  : 'Chưa có concert để quản lý'}
            </h2>
            <p>
              {ticketTypes.length
                ? 'Thử đổi từ khóa hoặc bộ lọc trạng thái.'
                : selectedConcertId
                  ? 'Tạo hạng vé đầu tiên để chuẩn bị mở bán.'
                  : 'Tạo concert trước, sau đó quay lại cấu hình hạng vé.'}
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
                Xóa bộ lọc
              </button>
            ) : selectedConcertId ? (
              <button className="admin-primary-action" type="button" onClick={openCreate}>
                Thêm hạng vé
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
          title={`Xóa hạng vé “${deleteTarget.name}”?`}
          description="Hạng vé sẽ bị xóa vĩnh viễn khỏi concert. Thao tác này không thể hoàn tác và chỉ thực hiện được khi chưa phát sinh lượt bán."
          confirmLabel="Xóa hạng vé"
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
            <span>Tồn kho vé</span>
            <h2 id="ticket-form-title">{editing ? `Sửa ${editing.name}` : 'Thêm hạng vé'}</h2>
          </div>
          <button type="button" aria-label="Đóng" onClick={onClose}>
            <X size={20} />
          </button>
        </header>
        <form onSubmit={onSubmit}>
          <div className="admin-form-grid">
            <label className="admin-field admin-field-wide">
              <span>Tên hạng vé</span>
              <input required maxLength={100} {...field('name')} />
            </label>
            <label className="admin-field">
              <span>Giá vé</span>
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
              <span>Màu vùng</span>
              <span className="admin-color-field">
                <input type="color" {...field('zoneColor')} />
                <input required pattern="^#[A-Fa-f0-9]{6}$" {...field('zoneColor')} />
              </span>
            </label>
            <label className="admin-field">
              <span>Tổng số lượng</span>
              <input
                required
                min="1"
                type="number"
                inputMode="numeric"
                {...field('totalQuantity')}
              />
            </label>
            <label className="admin-field">
              <span>Tối đa mỗi tài khoản</span>
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
              Hủy
            </button>
            <button className="admin-primary-action" type="submit" disabled={saving}>
              {saving ? 'Đang lưu...' : editing ? 'Lưu thay đổi' : 'Tạo hạng vé'}
            </button>
          </footer>
        </form>
      </section>
      </div>
    </ModalPortal>
  );
}
