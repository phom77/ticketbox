import { useCallback, useEffect, useMemo, useState } from 'react';
import { Eye, Filter, RefreshCw, Receipt, Ticket } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import {
  getAdminOrders,
  getAdminConcertTickets,
  updateAdminTicketStatus,
  getAdminConcerts,
  type ManagementApiScope,
} from '../../api/admin';
import type { Order, OrderStatus } from '../../api/orders';
import type { Ticket as TicketType } from '../../api/tickets';
import type { ConcertDetail } from '../../api/concerts';
import { ModalPortal } from '../../components/feedback/ModalPortal';

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
  return <span className={`status-badge ${variantClass[variant]}`}>{label}</span>;
}

// ---- Formatters ----

function fmt(amount: number) {
  return amount.toLocaleString('vi-VN', { style: 'currency', currency: 'VND' });
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleString('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

// ---- Order detail modal ----

function OrderDetailModal({ order, onClose }: { order: Order; onClose: () => void }) {
  return (
    <ModalPortal>
      <div className="admin-dialog-backdrop" onClick={onClose}>
      <div className="admin-dialog admin-dialog-compact" onClick={(e) => e.stopPropagation()}>
        <header>
          <div>
            <span>Chi tiết đơn hàng</span>
            <h2>{order.concertTitle}</h2>
          </div>
          <button onClick={onClose} aria-label="Đóng">
            ×
          </button>
        </header>
        <div style={{ padding: 24, display: 'grid', gap: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <InfoRow label="Mã đơn" value={order.id.slice(0, 8) + '…'} />
            <InfoRow label="Trạng thái">
              <StatusBadge label={order.status} variant={orderStatusVariant(order.status)} />
            </InfoRow>
            <InfoRow label="Tổng tiền" value={fmt(order.totalAmount)} />
            <InfoRow label="Ngày tạo" value={fmtDate(order.createdAt)} />
            <InfoRow label="Hết hạn" value={fmtDate(order.expiresAt)} />
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
              Sản phẩm
            </p>
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Loại vé</th>
                    <th>Số lượng</th>
                    <th>Đơn giá</th>
                    <th>Thành tiền</th>
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
      {children ?? <span style={{ fontSize: 13, fontWeight: 600 }}>{value}</span>}
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
      setError('Không thể tải danh sách vé.');
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
      setNotice({ type: 'success', msg: 'Cập nhật trạng thái vé thành công.' });
    } catch {
      setNotice({ type: 'error', msg: 'Cập nhật trạng thái vé thất bại.' });
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
            <option value="">— Chọn concert —</option>
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
            <option value="">Tất cả trạng thái</option>
            <option value="VALID">VALID</option>
            <option value="USED">USED</option>
            <option value="CANCELLED">CANCELLED</option>
            <option value="TRANSFERRED">TRANSFERRED</option>
          </select>
        </div>
        <button onClick={load} disabled={loading || !concertId}>
          <RefreshCw size={12} className={loading ? 'spin' : ''} />
          {loading ? 'Đang tải…' : 'Làm mới'}
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
          <h2>Chọn concert để xem vé</h2>
          <p>Danh sách vé sẽ hiện sau khi bạn chọn concert ở thanh lọc bên trên.</p>
        </div>
      ) : error ? (
        <div className="admin-notice error">{error}</div>
      ) : (
        <>
          <div style={{ marginBottom: 12, color: 'var(--muted)', fontSize: 12 }}>
            {loading ? 'Đang tải…' : `${tickets.length} vé`}
          </div>
          <div className="admin-data-panel">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Ticket ID</th>
                    <th>QR Code</th>
                    <th>Loại vé</th>
                    <th>Ngày cấp</th>
                    <th>Trạng thái</th>
                    <th>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {tickets.length === 0 && !loading && (
                    <tr>
                      <td
                        colSpan={6}
                        style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}
                      >
                        Không có vé nào.
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
                      <td>
                        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                          <select
                            value={t.status}
                            onChange={(e) => handleStatusChange(t.id, e.target.value)}
                            disabled={savingId === t.id}
                            style={{ fontSize: 11 }}
                          >
                            <option value="VALID">VALID</option>
                            <option value="USED">USED</option>
                            <option value="CANCELLED">CANCELLED</option>
                            <option value="TRANSFERRED">TRANSFERRED</option>
                          </select>
                          {savingId === t.id && <RefreshCw size={12} className="spin" />}
                        </div>
                      </td>
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

export function AdminOrdersPage({ apiScope = 'admin' }: { apiScope?: ManagementApiScope }) {
  const [searchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<TabId>('orders');

  // Orders tab state
  const [orders, setOrders] = useState<Order[]>([]);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [ordersError, setOrdersError] = useState('');
  const [statusFilter, setStatusFilter] = useState<OrderStatus | ''>('');
  const [concertFilter, setConcertFilter] = useState(() => searchParams.get('concertId') ?? '');
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Shared concerts list (for filters + ticket tab)
  const [concerts, setConcerts] = useState<ConcertDetail[]>([]);

  // Load concerts once
  useEffect(() => {
    getAdminConcerts(0, 200, undefined, undefined, apiScope)
      .then((p) => setConcerts(p.content))
      .catch(() => {});
  }, [apiScope]);

  const loadOrders = useCallback(async () => {
    setLoadingOrders(true);
    setOrdersError('');
    try {
      const data = await getAdminOrders(
        {
          concertId: concertFilter || undefined,
          status: (statusFilter as OrderStatus) || undefined,
        },
        apiScope,
      );
      setOrders(data);
    } catch {
      setOrdersError('Không thể tải danh sách đơn hàng.');
    } finally {
      setLoadingOrders(false);
    }
  }, [apiScope, concertFilter, statusFilter]);

  useEffect(() => {
    if (activeTab === 'orders') loadOrders();
  }, [activeTab, loadOrders]);

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
        eyebrow="Vận hành"
        title="Đơn hàng & Vé"
        description="Xem tất cả đơn hàng và vé trong hệ thống, lọc theo concert hoặc trạng thái, cập nhật trạng thái vé thủ công."
      />

      {/* Tabs */}
      <div className="admin-section-tabs" role="tablist" aria-label="Đơn hàng và vé">
        {(['orders', 'tickets'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`admin-section-tab${activeTab === tab ? ' is-active' : ''}`}
            role="tab"
            aria-selected={activeTab === tab}
          >
            {tab === 'orders' ? <Receipt size={14} /> : <Ticket size={14} />}
            {tab === 'orders' ? 'Đơn hàng' : 'Vé'}
          </button>
        ))}
      </div>

      {/* Orders tab */}
      {activeTab === 'orders' && (
        <div>
          {/* Stats */}
          <div className="admin-inline-stats admin-order-stats">
            <div>
              <span>Tổng đơn</span>
              <strong>{stats.total}</strong>
            </div>
            <div>
              <span>Đã thanh toán</span>
              <strong>{stats.paid}</strong>
            </div>
            <div>
              <span>Doanh thu</span>
              <strong>{fmt(stats.revenue)}</strong>
            </div>
          </div>

          {/* Toolbar */}
          <div className="admin-toolbar admin-filter-toolbar">
            <div className="admin-filter-controls">
              <Filter size={14} style={{ color: 'var(--muted)' }} />
              <select value={concertFilter} onChange={(e) => setConcertFilter(e.target.value)}>
                <option value="">Tất cả concert</option>
                {concerts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.title}
                  </option>
                ))}
              </select>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value as OrderStatus | '')}
              >
                <option value="">Tất cả trạng thái</option>
                <option value="AWAITING_PAYMENT">AWAITING_PAYMENT</option>
                <option value="PAID">PAID</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="CANCELLED">CANCELLED</option>
                <option value="PAYMENT_FAILED">PAYMENT_FAILED</option>
                <option value="REFUNDED">REFUNDED</option>
              </select>
            </div>
            <button onClick={loadOrders} disabled={loadingOrders}>
              <RefreshCw size={12} className={loadingOrders ? 'spin' : ''} />
              {loadingOrders ? 'Đang tải…' : 'Làm mới'}
            </button>
          </div>

          {ordersError && <div className="admin-notice error">{ordersError}</div>}

          <div className="admin-data-panel">
            <div className="admin-table-wrap">
              <table className="admin-table">
                <thead>
                  <tr>
                    <th>Order ID</th>
                    <th>Concert</th>
                    <th>Trạng thái</th>
                    <th>Tổng tiền</th>
                    <th>Ngày tạo</th>
                    <th>Hết hạn</th>
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
                        Đang tải…
                      </td>
                    </tr>
                  )}
                  {!loadingOrders && orders.length === 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        style={{ textAlign: 'center', color: 'var(--muted)', padding: '32px 0' }}
                      >
                        Không có đơn hàng nào.
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
                          title="Xem chi tiết"
                        >
                          <Eye size={12} />
                          Chi tiết
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Tickets tab */}
      {activeTab === 'tickets' && <TicketTab concerts={concerts} apiScope={apiScope} />}

      {/* Order detail modal */}
      {selectedOrder && (
        <OrderDetailModal order={selectedOrder} onClose={() => setSelectedOrder(null)} />
      )}
    </>
  );
}
