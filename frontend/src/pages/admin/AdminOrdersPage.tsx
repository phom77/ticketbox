import { translate, formatLanguage } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useOrganization } from '../../features/organizations/OrganizationProvider';
import { useCallback, useEffect, useId, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { ChevronLeft, ChevronRight, Eye, Filter, RefreshCw, Receipt, Search, Ticket, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import {
  getAdminOrders,
  getAdminConcertTickets,
  updateAdminTicketStatus,
  getAdminConcerts,
  searchAdminOrders,
  type ManagementApiScope,
  type OrderSupportLookup,
  type OrderSupportPage,
} from '../../api/admin';
import { ApiClientError, isRequestCanceled } from '../../api/client';
import type { Order, OrderStatus } from '../../api/orders';
import type { Ticket as TicketType } from '../../api/tickets';
import type { ConcertDetail } from '../../api/concerts';
import { ModalPortal } from '../../components/feedback/ModalPortal';
import { OrderSupportSections } from './OrderSupportSections';

// ---- Status badge helpers ----

type BadgeVariant = 'success' | 'warning' | 'error' | 'info' | 'muted';

function orderStatusVariant(status: OrderStatus): BadgeVariant {
  switch (status) {
    case 'PAID':
      return 'success';
    case 'AWAITING_PAYMENT':
      return 'warning';
    case 'EXPIRED':
      return 'muted';
    case 'CANCELLED':
      return 'muted';
    case 'PAYMENT_FAILED':
      return 'error';
    case 'REFUNDED':
      return 'info';
    default:
      return 'muted';
  }
}

function ticketStatusVariant(status: string): BadgeVariant {
  switch (status) {
    case 'VALID':
      return 'success';
    case 'USED':
      return 'info';
    case 'CANCELLED':
      return 'error';
    case 'TRANSFERRED':
      return 'warning';
    default:
      return 'muted';
  }
}

const variantClass: Record<BadgeVariant, string> = {
  success: 'badge-success',
  warning: 'badge-warning',
  error: 'badge-error',
  info: 'badge-info',
  muted: 'badge-muted',
};

function StatusBadge({ label, variant }: { label: string; variant: BadgeVariant }) {
  useTranslation();
  return <span className={`status-badge ${variantClass[variant]}`}>{translate(`status_${label}`, { defaultValue: label })}</span>;
}

// ---- Formatters ----

function fmt(amount: number) {
  return amount.toLocaleString(formatLanguage(), { style: 'currency', currency: 'VND' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString(formatLanguage(), {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- Order detail modal ----

function OrderDetailModal({ order, scope, onClose }: { order: Order; scope: ManagementApiScope; onClose: () => void }) {
  useTranslation();
  const titleId = useId();
  const closeButton = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const previous = document.activeElement;
    closeButton.current?.focus();
    return () => { if (previous instanceof HTMLElement) previous.focus(); };
  }, []);

  function handleKey(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === 'Escape') onClose();
    if (event.key !== 'Tab') return;
    const controls = event.currentTarget.querySelectorAll<HTMLElement>(
      'a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]',
    );
    const first = controls[0];
    const last = controls[controls.length - 1];
    const edge = event.shiftKey ? first : last;
    if (document.activeElement !== edge) return;
    event.preventDefault();
    (event.shiftKey ? last : first)?.focus();
  }

  return (
    <ModalPortal>
      <div className="admin-dialog-backdrop" onClick={onClose}>
      <div className="admin-dialog admin-dialog-compact" role="dialog" aria-modal="true" aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()} onKeyDown={handleKey}>
        <header>
          <div>
            <span>{translate("admin:adminOrdersPage_chiTietDonHang")}</span>
            <h2 id={titleId}>{order.concertTitle}</h2>
          </div>
          <button type="button" ref={closeButton} onClick={onClose} aria-label={translate("admin:adminOrdersPage_dong")}>
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <div style={{ padding: 24, display: 'grid', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <InfoRow label={translate("admin:adminOrdersPage_maDon")} value={order.id} />
            <InfoRow label={translate("admin:adminOrdersPage_trangThai")}>
              <StatusBadge label={order.status} variant={orderStatusVariant(order.status)} />
            </InfoRow>
            <InfoRow label={translate("admin:adminOrdersPage_tongTien")} value={fmt(order.totalAmount)} />
            <InfoRow label={translate("admin:adminOrdersPage_ngayTao")} value={fmtDate(order.createdAt)} />
            <InfoRow label={translate("admin:adminOrdersPage_hetHan")} value={fmtDate(order.expiresAt)} />
          </div>

          <div>
            <p
              style={{
                marginBottom: 8,
                color: 'var(--muted)',
                fontSize: 11,
                textTransform: 'uppercase',
                letterSpacing: '.1em',
              }}
            >
              {translate("admin:adminOrdersPage_sanPham")}
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{translate("admin:adminOrdersPage_loaiVe")}</th>
                    <th>{translate("admin:adminOrdersPage_soLuong")}</th>
                    <th>{translate("admin:adminOrdersPage_donGia")}</th>
                    <th>{translate("admin:adminOrdersPage_thanhTien")}</th>
                  </tr>
                </thead>
                <tbody>
                  {order.items.map((item) => (
                    <tr key={item.id}>
                      <td>{item.ticketTypeName}</td>
                      <td>{item.quantity}</td>
                      <td>{fmt(item.unitPrice)}</td>
                      <td>{fmt(item.subtotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <OrderSupportSections orderId={order.id} scope={scope} />
        </div>
      </div>
      </div>
    </ModalPortal>
  );
}

function InfoRow({
  label,
  value,
  children,
}: {
  label: string;
  value?: string;
  children?: React.ReactNode;
}) {
  useTranslation();
  return (
    <div>
      <span
        style={{
          display: 'block',
          color: '#77747e',
          fontSize: 10,
          textTransform: 'uppercase',
          letterSpacing: '.1em',
          marginBottom: 4,
        }}
      >
        {label}
      </span>
      {children ?? <span style={{ fontSize: 13, fontWeight: 600, overflowWrap: 'anywhere' }}>{value}</span>}
    </div>
  );
}

// ---- Ticket tab ----

function TicketTab({
  concerts,
  apiScope,
}: {
  concerts: ConcertDetail[];
  apiScope: ManagementApiScope;
}) {
  useTranslation();
  const organization = useOrganization();
  const canManageTickets = apiScope === 'admin' || !!organization?.selected?.grants.includes('EVENTS');
  const [concertId, setConcertId] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [tickets, setTickets] = useState<TicketType[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ type: 'success' | 'error'; msg: string } | null>(null);

  const load = useCallback(async () => {
    if (!concertId) return;
    setLoading(true);
    setError('');
    try {
      const data = await getAdminConcertTickets(concertId, statusFilter || undefined, apiScope);
      setTickets(data);
    } catch {
      setError(translate("admin:adminOrdersPage_khongTheTaiDanhSachVe"));
    } finally {
      setLoading(false);
    }
  }, [apiScope, concertId, statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleStatusChange(ticketId: string, newStatus: string) {
    setSavingId(ticketId);
    setNotice(null);
    try {
      const result = await updateAdminTicketStatus(ticketId, newStatus, apiScope);
      const updated = result.data;
      setTickets((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
      setNotice({ type: 'success', msg: translate("admin:adminOrdersPage_capNhatTrangThaiVeThanhCong") });
    } catch {
      setNotice({ type: 'error', msg: translate("admin:adminOrdersPage_capNhatTrangThaiVeThatBai") });
    } finally {
      setSavingId(null);
    }
  }

  return (
    <div>
      <div className="admin-toolbar admin-filter-toolbar">
        <div className="admin-filter-controls">
          <Filter size={14} style={{ color: 'var(--muted)' }} />
          <select value={concertId} onChange={(e) => setConcertId(e.target.value)}>
            <option value="">{translate("admin:adminOrdersPage_chonConcert")}</option>
            {concerts.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            disabled={!concertId}
          >
            <option value="">{translate("admin:adminOrdersPage_tatCaTrangThai")}</option>
            <option value="VALID">{translate('status_VALID')}</option>
            <option value="USED">{translate('status_USED')}</option>
            <option value="CANCELLED">{translate('status_CANCELLED')}</option>
            <option value="TRANSFERRED">{translate('status_TRANSFERRED')}</option>
          </select>
        </div>
        <button onClick={load} disabled={loading || !concertId}>
          <RefreshCw size={12} className={loading ? 'spin' : ''} />
          {loading ? translate("admin:adminOrdersPage_dangTai") : translate("admin:adminOrdersPage_lamMoi")}
        </button>
      </div>

      {notice && (
        <div className={`admin-notice ${notice.type}`} style={{ marginBottom: 14 }}>
          {notice.msg}
        </div>
      )}

      {!concertId ? (
        <div className="admin-placeholder">
          <Ticket size={40} strokeWidth={1.4} />
          <h2>{translate("admin:adminOrdersPage_chonConcertDeXemVe")}</h2>
          <p>{translate("admin:adminOrdersPage_danhSachVeSeHienSauKhi")}</p>
        </div>
      ) : error ? (
        <div className="admin-notice error">{error}</div>
      ) : (
        <>
          <div style={{ marginBottom: 12, color: 'var(--muted)', fontSize: 12 }}>
            {loading ? translate("admin:adminOrdersPage_dangTai") : translate("admin:adminOrdersPage_ve", { count: tickets.length })}
          </div>
          <div className="admin-data-panel">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{translate("admin:adminOrdersPage_ticketId")}</th>
                    <th>{translate('qrCode')}</th>
                    <th>{translate("admin:adminOrdersPage_loaiVe")}</th>
                    <th>{translate("admin:adminOrdersPage_ngayCap")}</th>
                    <th>{translate("admin:adminOrdersPage_trangThai")}</th>
                    {canManageTickets ? <th>{translate("admin:adminOrdersPage_thaoTac")}</th> : null}
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 && !loading && (
                    <tr>
                      <td
                        colSpan={canManageTickets ? 6 : 5}
                        style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}
                      >
                        {translate("admin:adminOrdersPage_khongCoVeNao")}
                      </td>
                    </tr>
                  )}
                  {tickets.map((t) => (
                    <tr key={t.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{t.id.slice(0, 8)}…</td>
                      <td
                        style={{
                          fontFamily: 'monospace',
                          fontSize: 11,
                          color: 'var(--muted)',
                          maxWidth: 160,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {t.qrCode.slice(0, 24)}…
                      </td>
                      <td>{t.ticketTypeName}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>{fmtDate(t.issuedAt)}</td>
                      <td>
                        <StatusBadge label={t.status} variant={ticketStatusVariant(t.status)} />
                      </td>
                      {canManageTickets ? (
                        <td>
                          <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                            <select
                              value={t.status}
                              onChange={(e) => handleStatusChange(t.id, e.target.value)}
                              disabled={savingId === t.id}
                              style={{ fontSize: 11 }}
                            >
                              <option value="VALID">{translate('status_VALID')}</option>
                              <option value="USED">{translate('status_USED')}</option>
                              <option value="CANCELLED">{translate('status_CANCELLED')}</option>
                              <option value="TRANSFERRED">{translate('status_TRANSFERRED')}</option>
                            </select>
                            {savingId === t.id && <RefreshCw size={12} className="spin" />}
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ---- Main page ----

type TabId = 'orders' | 'tickets';
const orderLookupLabels = {
  get orderId() { return translate("admin:adminOrdersPage_maDonHang"); },
  get buyerEmail() { return translate("admin:adminOrdersPage_emailNguoiMua"); },
  get transactionRef() { return translate("admin:adminOrdersPage_maGiaoDich"); },
} satisfies Record<OrderSupportLookup['field'], string>;

function orderLoadMessage(error: unknown, lookup: OrderSupportLookup | null) {
  if (error instanceof ApiClientError && error.status === 403) {
    return translate("admin:adminOrdersPage_banKhongConQuyenXemDonHang");
  }
  if (!lookup) return translate("admin:adminOrdersPage_khongTheTaiDanhSachDonHang");
  if (error instanceof ApiClientError && error.status === 400) {
    return translate("admin:adminOrdersPage_hayKiemTraRoiTraCuuLai", { arg1: orderLookupLabels[lookup.field].toLowerCase() });
  }
  return translate("admin:adminOrdersPage_traCuuDonHangTamThoiKhong");
}

export function AdminOrdersPage({ apiScope = 'admin' }: { apiScope?: ManagementApiScope }) {
  useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialOrderId = apiScope === 'admin' ? searchParams.get('orderId')?.trim() : undefined;
  const [activeTab, setActiveTab] = useState<TabId>('orders');

  // Orders tab state
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [concertFilter, setConcertFilter] = useState(() => searchParams.get('concertId') ?? '');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [lookupField, setLookupField] = useState<OrderSupportLookup['field']>('orderId');
  const [lookupValue, setLookupValue] = useState(initialOrderId ?? '');
  const [lookup, setLookup] = useState<OrderSupportLookup | null>(
    () => initialOrderId ? { field: 'orderId', value: initialOrderId } : null,
  );
  const [page, setPage] = useState(0);
  const [supportPage, setSupportPage] = useState<OrderSupportPage | null>(null);
  const [refresh, setRefresh] = useState(0);

  // Shared concerts list (for filters + ticket tab)
  const [concerts, setConcerts] = useState<ConcertDetail[]>([]);

  useEffect(() => {
    const controller = new AbortController();
    getAdminConcerts(0, 200, undefined, controller.signal, apiScope)
      .then((p) => {
        if (!controller.signal.aborted) setConcerts(p.content);
      })
      .catch(() => {});
    return () => controller.abort();
  }, [apiScope]);

  useEffect(() => {
    if (activeTab !== 'orders') return;
    const controller = new AbortController();
    setLoadingOrders(true);
    setOrdersError('');
    setOrders([]);
    const concertId = concertFilter || undefined;

    async function loadOrders() {
      try {
        if (lookup) {
          const result = await searchAdminOrders(lookup, { concertId, page, size: 20 }, apiScope, controller.signal);
          if (controller.signal.aborted) return;
          setOrders(result.content);
          setSupportPage(result);
        } else {
          const result = await getAdminOrders({ concertId, status: statusFilter || undefined }, apiScope, controller.signal);
          if (!controller.signal.aborted) setOrders(result);
        }
      } catch (error) {
        if (!controller.signal.aborted && !isRequestCanceled(error)) {
          setOrdersError(orderLoadMessage(error, lookup));
          setSupportPage(null);
        }
      } finally {
        if (!controller.signal.aborted) setLoadingOrders(false);
      }
    }

    void loadOrders();
    return () => controller.abort();
  }, [activeTab, apiScope, concertFilter, lookup, page, refresh, statusFilter]);

  function submitLookup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = lookupValue.trim();
    if (!value) return;
    clearOrderLink();
    setPage(0);
    setSupportPage(null);
    setLookup({ field: lookupField, value });
  }

  function clearLookup() {
    clearOrderLink();
    setLookupValue('');
    setLookup(null);
    setSupportPage(null);
    setPage(0);
  }

  function clearOrderLink() {
    if (!searchParams.has('orderId')) return;
    const next = new URLSearchParams(searchParams);
    next.delete('orderId');
    setSearchParams(next, { replace: true });
  }

  const stats = useMemo(() => {
    const total = orders.length;
    const paid = orders.filter((o) => o.status === 'PAID').length;
    const revenue = orders
      .filter((o) => o.status === 'PAID')
      .reduce((s, o) => s + o.totalAmount, 0);
    return { total, paid, revenue };
  }, [orders]);

  return (
    <>
      <AdminPageHeader
        eyebrow={translate("admin:adminOrdersPage_vanHanh")}
        title={translate("admin:adminOrdersPage_donHangVe")}
        description={apiScope === 'organizer'
          ? translate("admin:adminOrdersPage_xemDonHangVaVeCuaTo")
          : translate("admin:adminOrdersPage_xemDonHangVaVeTraCuu")}
      />

      {/* Tabs */}
      <div className="admin-section-tabs" role="tablist" aria-label={translate("admin:adminOrdersPage_donHangVaVe")}>
        {(['orders', 'tickets'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`admin-section-tab${activeTab === tab ? ' is-active' : ''}`}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {tab === 'orders' ? <Receipt size={14} /> : <Ticket size={14} />}
            {tab === 'orders' ? translate("admin:adminOrdersPage_donHang") : translate("admin:adminOrdersPage_ve_2")}
          </button>
        ))}
      </div>

      {/* Orders tab */}
      {activeTab === 'orders' && (
        <div>
          {/* Stats */}
          {!lookup && !loadingOrders && !ordersError && <div className="admin-inline-stats admin-order-stats">
            <div>
              <span>{translate("admin:adminOrdersPage_tongDon")}</span>
              <strong>{stats.total}</strong>
            </div>
            <div>
              <span>{translate("admin:adminOrdersPage_daThanhToan")}</span>
              <strong>{stats.paid}</strong>
            </div>
            <div>
              <span>{translate('revenue')}</span>
              <strong>{fmt(stats.revenue)}</strong>
            </div>
          </div>}

          <form className="admin-toolbar admin-order-support-form" role="search" aria-label={translate("admin:adminOrdersPage_traCuuDonHang")} onSubmit={submitLookup}>
            <select
              aria-label={translate("admin:adminOrdersPage_timTheo")}
              value={lookupField}
              onChange={(event) => {
                setLookupField(event.target.value as OrderSupportLookup['field']);
                setLookupValue('');
              }}
            >
              {Object.entries(orderLookupLabels).map(([field, label]) => <option key={field} value={field}>{label}</option>)}
            </select>
            <label className="admin-search-control">
              <Search aria-hidden="true" size={16} />
              <input
                type={lookupField === 'buyerEmail' ? 'email' : 'text'}
                autoComplete="off"
                aria-label={orderLookupLabels[lookupField]}
                placeholder={orderLookupLabels[lookupField]}
                value={lookupValue}
                onChange={(event) => setLookupValue(event.target.value)}
                required
              />
            </label>
            <div className="admin-order-support-actions">
              <button type="submit" disabled={!lookupValue.trim()}>{translate("admin:adminOrdersPage_traCuu")}</button>
              {lookup && <button type="button" onClick={clearLookup}>{translate("admin:adminOrdersPage_xoaTraCuu")}</button>}
            </div>
          </form>

          {/* Toolbar */}
          <div className="admin-toolbar admin-filter-toolbar">
            <div className="admin-filter-controls">
              <Filter size={14} style={{ color: 'var(--muted)' }} />
              <select aria-label={translate("admin:adminOrdersPage_buoiDien")} value={concertFilter} onChange={(event) => {
                setConcertFilter(event.target.value);
                setSupportPage(null);
                setPage(0);
              }}>
                <option value="">{translate("admin:adminOrdersPage_tatCaConcert")}</option>
                {concerts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              {!lookup && <select
                aria-label={translate("admin:adminOrdersPage_trangThaiDonHang")}
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
              >
                <option value="">{translate("admin:adminOrdersPage_tatCaTrangThai")}</option>
                <option value="AWAITING_PAYMENT">{translate('status_AWAITING_PAYMENT')}</option>
                <option value="PAID">{translate('status_PAID')}</option>
                <option value="EXPIRED">{translate('status_EXPIRED')}</option>
                <option value="CANCELLED">{translate('status_CANCELLED')}</option>
                <option value="PAYMENT_FAILED">{translate('status_PAYMENT_FAILED')}</option>
                <option value="REFUNDED">{translate('status_REFUNDED')}</option>
              </select>}
            </div>
            <button type="button" onClick={() => setRefresh((value) => value + 1)} disabled={loadingOrders}>
              <RefreshCw size={12} className={loadingOrders ? 'spin' : ''} />
              {loadingOrders ? translate("admin:adminOrdersPage_dangTai") : translate("admin:adminOrdersPage_lamMoi")}
            </button>
          </div>

          {ordersError && <div className="admin-notice error" role="alert">{ordersError}</div>}

          <div className="admin-data-panel" aria-busy={loadingOrders}>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>{translate('orderId')}</th>
                    <th>{translate('event')}</th>
                    <th>{translate("admin:adminOrdersPage_trangThai")}</th>
                    <th>{translate("admin:adminOrdersPage_tongTien")}</th>
                    <th>{translate("admin:adminOrdersPage_ngayTao")}</th>
                    <th>{translate("admin:adminOrdersPage_hetHan")}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {loadingOrders && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}
                      >
                        {translate("admin:adminOrdersPage_dangTai")}
                      </td>
                    </tr>
                  )}
                  {!loadingOrders && !ordersError && orders.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}
                      >
                        {lookup ? translate("admin:adminOrdersPage_khongTimThayDonHangPhuHop") : translate("admin:adminOrdersPage_khongCoDonHangNao")}
                      </td>
                    </tr>
                  )}
                  {orders.map((order) => (
                    <tr key={order.id}>
                      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>
                        {order.id.slice(0, 8)}…
                      </td>
                      <td
                        style={{
                          maxWidth: 200,
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap',
                        }}
                      >
                        {order.concertTitle}
                      </td>
                      <td>
                        <StatusBadge
                          label={order.status}
                          variant={orderStatusVariant(order.status)}
                        />
                      </td>
                      <td style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                        {fmt(order.totalAmount)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 12 }}>
                        {fmtDate(order.createdAt)}
                      </td>
                      <td style={{ whiteSpace: 'nowrap', color: 'var(--muted)', fontSize: 12 }}>
                        {fmtDate(order.expiresAt)}
                      </td>
                      <td>
                        <button
                          className="admin-secondary-action"
                          style={{ minHeight: 32, padding: '0 12px', fontSize: 11 }}
                          onClick={() => setSelectedOrder(order)}
                          title={translate("admin:adminOrdersPage_xemChiTiet")}
                        >
                          <Eye size={12} />
                          {translate("admin:adminOrdersPage_chiTiet")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {supportPage && supportPage.totalElements > 0 && (
            <div className="admin-pagination admin-order-support-pagination">
              <span role="status">
                {translate('orderPageNumber', { orders: supportPage.totalElements.toLocaleString(formatLanguage()), page: supportPage.page + 1, total: supportPage.totalPages })}
              </span>
              {supportPage.totalPages > 1 && <div>
                <button
                  type="button"
                  aria-label={translate("admin:adminOrdersPage_trangTruoc")}
                  aria-disabled={loadingOrders || supportPage.page === 0}
                  onClick={() => { if (!loadingOrders && supportPage.page > 0) setPage(supportPage.page - 1); }}
                >
                  <ChevronLeft aria-hidden="true" size={17} />
                </button>
                <button
                  type="button"
                  aria-label={translate('pageNext')}
                  aria-disabled={loadingOrders || supportPage.page + 1 >= supportPage.totalPages}
                  onClick={() => { if (!loadingOrders && supportPage.page + 1 < supportPage.totalPages) setPage(supportPage.page + 1); }}
                >
                  <ChevronRight aria-hidden="true" size={17} />
                </button>
              </div>}
            </div>
          )}
        </div>
      )}

      {/* Tickets tab */}
      {activeTab === 'tickets' && <TicketTab concerts={concerts} apiScope={apiScope} />}

      {/* Order detail modal */}
      {selectedOrder && (
        <OrderDetailModal key={selectedOrder.id} order={selectedOrder} scope={apiScope} onClose={() => setSelectedOrder(null)} />
      )}
    </>
  );
}
