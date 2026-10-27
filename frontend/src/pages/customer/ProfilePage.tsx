import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { api, ApiClientError } from '../../api/client';
import { useAuth, type UserRole, type UserSummary } from '../../features/auth/AuthContext';
import { QRCodeSVG } from 'qrcode.react';

interface UserProfile {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: UserRole;
}

interface OrderItem {
  ticketTypeId: string;
  ticketTypeName: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
}

interface OrderResponse {
  id: string;
  concertId: string;
  concertTitle: string;
  status: 'AWAITING_PAYMENT' | 'PAID' | 'CANCELLED' | 'EXPIRED' | 'PAYMENT_FAILED';
  totalAmount: number;
  expiresAt?: string | null;
  createdAt: string;
  items: OrderItem[];
}

interface TicketResponse {
  id: string;
  concertId: string;
  concertTitle: string;
  ticketTypeName: string;
  price: number;
  qrCode: string;
  status: 'VALID' | 'UNUSED' | 'USED' | 'CANCELLED' | 'EXPIRED';
  ownerFullName: string;
  ownerPhone: string;
}

type ProfileTab = 'profile' | 'orders' | 'tickets';

const money = new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const dateTime = new Intl.DateTimeFormat('vi-VN', { dateStyle: 'medium', timeStyle: 'short' });

const roleLabels: Record<UserRole, string> = {
  AUDIENCE: 'Audience',
  ORGANIZER: 'Organizer',
  STAFF: 'Staff',
  ADMIN: 'Admin',
};

const orderLabels: Record<OrderResponse['status'], string> = {
  AWAITING_PAYMENT: 'Chờ thanh toán',
  PAID: 'Đã thanh toán',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
  PAYMENT_FAILED: 'Thanh toán lỗi',
};

const ticketLabels: Record<TicketResponse['status'], string> = {
  VALID: 'Chưa sử dụng',
  UNUSED: 'Chưa sử dụng',
  USED: 'Đã sử dụng',
  CANCELLED: 'Đã hủy',
  EXPIRED: 'Hết hạn',
};

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function errorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function ProfilePage() {
  const { user, updateUserSummary } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [tickets, setTickets] = useState<TicketResponse[]>([]);
  const [activeTab, setActiveTab] = useState<ProfileTab>('profile');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showAudienceHistory = user?.role === 'AUDIENCE';

  useEffect(() => {
    let cancelled = false;

    async function loadProfileData() {
      setLoading(true);
      setLoadError(null);
      setMessage(null);

      try {
        if (showAudienceHistory) {
          const [profileData, ordersData, ticketsData] = await Promise.all([
            api.get<unknown, UserProfile>('/api/users/me/profile'),
            api.get<unknown, OrderResponse[]>('/api/orders/my'),
            api.get<unknown, TicketResponse[]>('/api/tickets/my'),
          ]);

          if (cancelled) return;
          setProfile(profileData);
          setFullName(profileData.fullName);
          setPhone(profileData.phone ?? '');
          setOrders(ordersData ?? []);
          setTickets(ticketsData ?? []);
          return;
        }

        const profileData = await api.get<unknown, UserProfile>('/api/users/me/profile');
        if (cancelled) return;
        setProfile(profileData);
        setFullName(profileData.fullName);
        setPhone(profileData.phone ?? '');
        setOrders([]);
        setTickets([]);
        setActiveTab('profile');
      } catch (error) {
        if (!cancelled) {
          const isForbidden = error instanceof ApiClientError && error.status === 403;
          setLoadError(
            isForbidden
              ? 'Tài khoản hiện tại không có quyền xem dữ liệu này.'
              : errorMessage(error, 'Không thể tải hồ sơ.'),
          );
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadProfileData();

    return () => {
      cancelled = true;
    };
  }, [showAudienceHistory]);

  const profileSummary = useMemo(() => {
    if (!profile) return [];
    return [
      { label: 'Email', value: profile.email },
      { label: 'Số điện thoại', value: profile.phone || 'Chưa cập nhật' },
      { label: 'Vai trò', value: roleLabels[profile.role] },
    ];
  }, [profile]);

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const nextFullName = fullName.trim();
    const nextPhone = phone.trim();

    if (!nextFullName) {
      setMessage({ type: 'error', text: 'Vui lòng nhập họ tên.' });
      return;
    }

    try {
      setSaving(true);
      const updated = await api.patch<unknown, UserProfile>('/api/users/me/profile', {
        fullName: nextFullName,
        phone: nextPhone || null,
      });
      setProfile(updated);
      setFullName(updated.fullName);
      setPhone(updated.phone ?? '');
      setIsEditing(false);
      updateUserSummary({
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
      } satisfies UserSummary);
      setMessage({ type: 'success', text: 'Cập nhật thông tin cá nhân thành công.' });
    } catch (error) {
      setMessage({
        type: 'error',
        text: errorMessage(error, 'Cập nhật thất bại. Vui lòng thử lại.'),
      });
    } finally {
      setSaving(false);
    }
  }

  function cancelEditing() {
    if (!profile) return;
    setFullName(profile.fullName);
    setPhone(profile.phone ?? '');
    setIsEditing(false);
    setMessage(null);
  }

  if (loading) {
    return (
      <main className="profile-page page-width">
        <div className="profile-loading" role="status" aria-live="polite">
          <div className="route-spinner" aria-hidden="true" />
          <span>Đang tải hồ sơ...</span>
        </div>
      </main>
    );
  }

  if (loadError || !profile) {
    return (
      <main className="profile-page page-width">
        <div className="state-panel" role="alert">
          <span className="state-icon" aria-hidden="true">
            !
          </span>
          <h1>Không thể mở hồ sơ</h1>
          <p>{loadError ?? 'Không tìm thấy thông tin tài khoản hiện tại.'}</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => window.location.reload()}
          >
            Thử lại
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="profile-page page-width">
      <section className="profile-hero">
        <div className="profile-avatar" aria-hidden="true">
          {initials(profile.fullName)}
        </div>
        <div>
          <p className="eyebrow">
            <span /> Account center
          </p>
          <h1>{profile.fullName}</h1>
          <p>Quản lý hồ sơ, quyền truy cập và lịch sử đặt vé của tài khoản TicketBox.</p>
        </div>
        <span className={`role-badge role-${profile.role.toLowerCase()}`}>
          {roleLabels[profile.role]}
        </span>
      </section>

      <div className="profile-tabs" role="tablist" aria-label="Các mục hồ sơ">
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'profile'}
          className={activeTab === 'profile' ? 'active' : ''}
          onClick={() => setActiveTab('profile')}
        >
          Hồ sơ
        </button>
        {showAudienceHistory ? (
          <>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'orders'}
              className={activeTab === 'orders' ? 'active' : ''}
              onClick={() => setActiveTab('orders')}
            >
              Orders ({orders.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'tickets'}
              className={activeTab === 'tickets' ? 'active' : ''}
              onClick={() => setActiveTab('tickets')}
            >
              Tickets ({tickets.length})
            </button>
          </>
        ) : null}
      </div>

      {message ? (
        <div className={`inline-message ${message.type}`} role="status">
          {message.text}
        </div>
      ) : null}

      {activeTab === 'profile' ? (
        <section className="profile-grid">
          <form className="profile-panel" onSubmit={handleUpdateProfile}>
            <div className="panel-heading">
              <div>
                <span>Identity</span>
                <h2>Personal details</h2>
              </div>
              {!isEditing ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setIsEditing(true)}
                >
                  Edit
                </button>
              ) : null}
            </div>

            <label className="field">
              <span>Địa chỉ email</span>
              <input type="email" value={profile.email} disabled />
            </label>
            <label className="field">
              <span>Full name</span>
              <input
                type="text"
                value={fullName}
                onChange={(event) => setFullName(event.target.value)}
                disabled={!isEditing}
                autoComplete="name"
                required
              />
            </label>
            <label className="field">
              <span>Phone number</span>
              <input
                type="tel"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                disabled={!isEditing}
                autoComplete="tel"
                placeholder="0901234567"
              />
            </label>

            {isEditing ? (
              <div className="profile-actions">
                <button className="button button-secondary" type="button" onClick={cancelEditing}>
                  Cancel
                </button>
                <button className="button button-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : 'Save changes'}
                </button>
              </div>
            ) : null}
          </form>

          <aside className="profile-panel profile-summary" aria-label="Tóm tắt tài khoản">
            <div className="panel-heading">
              <div>
                <span>Access</span>
                <h2>Role guard</h2>
              </div>
            </div>
            {profileSummary.map((item) => (
              <div className="summary-row" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
            <p>
              {profile.role === 'AUDIENCE'
                ? 'Audience accounts can buy tickets, pay orders, and view e-tickets.'
                : 'This role is kept out of the audience purchase flow in the web UI to match backend RBAC.'}
            </p>
          </aside>
        </section>
      ) : null}

      {activeTab === 'orders' && showAudienceHistory ? <OrderHistory orders={orders} /> : null}
      {activeTab === 'tickets' && showAudienceHistory ? <TicketHistory tickets={tickets} /> : null}
    </main>
  );
}

function OrderHistory({ orders }: { orders: OrderResponse[] }) {
  if (orders.length === 0) {
    return (
      <div className="state-panel compact">
        <span className="state-icon" aria-hidden="true">
          ◇
        </span>
        <h2>Chưa có đơn hàng</h2>
        <p>Các đơn mua vé sẽ xuất hiện tại đây sau khi bạn đặt vé.</p>
      </div>
    );
  }

  return (
    <section className="history-list" aria-label="Lịch sử đơn hàng">
      {orders.map((order) => (
        <OrderHistoryItem key={order.id} order={order} />
      ))}
    </section>
  );
}

function OrderHistoryItem({ order }: { order: OrderResponse }) {
  return (
    <article className="history-item" style={{ position: 'relative' }}>
      <div className="history-topline">
        <span>Order {order.id.slice(0, 8).toUpperCase()}</span>
        <span className={`status-chip status-${order.status.toLowerCase().replace('_', '-')}`}>
          {orderLabels[order.status]}
        </span>
      </div>
      <h2>{order.concertTitle}</h2>
      <div className="history-lines">
        {order.items.map((item) => (
          <div key={item.ticketTypeId}>
            <span>
              {item.ticketTypeName} x{item.quantity}
            </span>
            <strong>{money.format(item.subtotal || item.unitPrice * item.quantity)}</strong>
          </div>
        ))}
      </div>

      {order.status === 'AWAITING_PAYMENT' && (
        <div
          style={{
            marginTop: 14,
            padding: '12px 14px',
            background: '#f8fafc',
            border: '1px solid var(--line)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
        >
          <div>
            <strong style={{ display: 'block', fontSize: 13, color: '#182133' }}>Đơn đang chờ thanh toán</strong>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>Mở lại đơn để chọn và tiếp tục thanh toán an toàn.</span>
          </div>
          <Link
            className="button button-primary"
            style={{ minHeight: 34, padding: '0 16px', fontSize: 12 }}
            to={`/checkout?orderId=${encodeURIComponent(order.id)}`}
          >
            Tiếp tục thanh toán
          </Link>
        </div>
      )}

      <div className="history-total">
        <span>{dateTime.format(new Date(order.createdAt))}</span>
        <strong>{money.format(order.totalAmount)}</strong>
      </div>
    </article>
  );
}

function TicketHistory({ tickets }: { tickets: TicketResponse[] }) {
  if (tickets.length === 0) {
    return (
      <div className="state-panel compact">
        <span className="state-icon" aria-hidden="true">
          ◇
        </span>
        <h2>Chưa có vé</h2>
        <p>Vé điện tử và mã QR sẽ hiển thị sau khi thanh toán thành công.</p>
      </div>
    );
  }

  return (
    <section className="ticket-history-grid" aria-label="Lịch sử vé">
      {tickets.map((ticket) => (
        <article className="profile-ticket" key={ticket.id}>
          <div className="history-topline">
            <span>Ticket {ticket.id.slice(0, 8).toUpperCase()}</span>
            <span className={`status-chip status-${ticket.status.toLowerCase()}`}>
              {ticketLabels[ticket.status]}
            </span>
          </div>
          <h2>{ticket.concertTitle}</h2>
          <p style={{ fontWeight: 600, color: '#182133' }}>{ticket.ticketTypeName}</p>
          {ticket.status === 'VALID' || ticket.status === 'UNUSED' ? (
            <div
              className="profile-qr"
              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}
            >
              <QRCodeSVG
                value={ticket.qrCode}
                size={140}
                level="M"
                marginSize={2}
                style={{ background: '#fff', padding: 6, borderRadius: 3 }}
              />
              <span>Xuất trình mã QR tại cửa soát vé</span>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
