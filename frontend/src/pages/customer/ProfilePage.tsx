import { dateFormatter, numberFormatter } from '../../data/formatters';
import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
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

const money = numberFormatter({
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
});
const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

const roleLabels: Record<UserRole, string> = {
  AUDIENCE: 'Audience',
  get ORGANIZER() { return translate("customer:profilePage_organizer"); },
  STAFF: 'Staff',
  get ADMIN() { return translate("customer:profilePage_admin"); },
};

const orderLabels: Record<OrderResponse['status'], string> = {
  get AWAITING_PAYMENT() { return translate("customer:profilePage_choThanhToan"); },
  get PAID() { return translate("customer:profilePage_daThanhToan"); },
  get CANCELLED() { return translate("customer:profilePage_daHuy"); },
  get EXPIRED() { return translate("customer:profilePage_hetHan"); },
  get PAYMENT_FAILED() { return translate("customer:profilePage_thanhToanLoi"); },
};

const ticketLabels: Record<TicketResponse['status'], string> = {
  get VALID() { return translate("customer:profilePage_chuaSuDung"); },
  get UNUSED() { return translate("customer:profilePage_chuaSuDung"); },
  get USED() { return translate("customer:profilePage_daSuDung"); },
  get CANCELLED() { return translate("customer:profilePage_daHuy"); },
  get EXPIRED() { return translate("customer:profilePage_hetHan"); },
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
  useTranslation();
  const { user, updateUserSummary } = useAuth();
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [orders, setOrders] = useState<OrderResponse[]>([]);
  const [tickets, setTickets] = useState<TicketResponse[]>([]);
  const [searchParams, setSearchParams] = useSearchParams();
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const showAudienceHistory = user?.role === 'AUDIENCE';
  const tab = searchParams.get('tab');
  const activeTab = showAudienceHistory && (tab === 'orders' || tab === 'tickets') ? tab : 'profile';

  function selectTab(next: ProfileTab) {
    setSearchParams(next === 'profile' ? {} : { tab: next }, { replace: true });
  }

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
      } catch (error) {
        if (!cancelled) {
          const isForbidden = error instanceof ApiClientError && error.status === 403;
          setLoadError(
            isForbidden
              ? translate("customer:profilePage_taiKhoanHienTaiKhongCoQuyen")
              : errorMessage(error, translate("customer:profilePage_khongTheTaiHoSo")),
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
      { label: translate("customer:profilePage_soDienThoai"), value: profile.phone || translate("customer:profilePage_chuaCapNhat") },
      { label: translate("customer:profilePage_vaiTro"), value: roleLabels[profile.role] },
    ];
  }, [profile]);

  async function handleUpdateProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const nextFullName = fullName.trim();
    const nextPhone = phone.trim();

    if (!nextFullName) {
      setMessage({ type: 'error', text: translate("customer:profilePage_vuiLongNhapHoTen") });
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
      setMessage({ type: 'success', text: translate("customer:profilePage_capNhatThongTinCaNhanThanh") });
    } catch (error) {
      setMessage({
        type: 'error',
        text: errorMessage(error, translate("customer:profilePage_capNhatThatBaiVuiLongThu")),
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
          <span>{translate("customer:profilePage_dangTaiHoSo")}</span>
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
          <h1>{translate("customer:profilePage_khongTheMoHoSo")}</h1>
          <p>{loadError ?? translate("customer:profilePage_khongTimThayThongTinTaiKhoan")}</p>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => window.location.reload()}
          >
            {translate("customer:profilePage_thuLai")}
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
            <span /> {translate("customer:profilePage_accountCenter")}
          </p>
          <h1>{profile.fullName}</h1>
          <p>{translate("customer:profilePage_quanLyHoSoQuyenTruyCap")}</p>
        </div>
        <span className={`role-badge role-${profile.role.toLowerCase()}`}>
          {roleLabels[profile.role]}
        </span>
      </section>

      <div className="profile-tabs" role="tablist" aria-label={translate("customer:profilePage_cacMucHoSo")}>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'profile'}
          className={activeTab === 'profile' ? 'active' : ''}
          onClick={() => selectTab('profile')}
        >
          {translate("customer:profilePage_hoSo")}
        </button>
        {showAudienceHistory ? (
          <>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'orders'}
              className={activeTab === 'orders' ? 'active' : ''}
              onClick={() => selectTab('orders')}
            >
              {translate("customer:profilePage_donHang")}{orders.length})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'tickets'}
              className={activeTab === 'tickets' ? 'active' : ''}
              onClick={() => selectTab('tickets')}
            >
              {translate("customer:profilePage_ve")}{tickets.length})
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
                <span>{translate("customer:profilePage_identity")}</span>
                <h2>{translate("customer:profilePage_personalDetails")}</h2>
              </div>
              {!isEditing ? (
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => setIsEditing(true)}
                >
                  {translate("customer:profilePage_edit")}
                </button>
              ) : null}
            </div>

            <label className="field">
              <span>{translate("customer:profilePage_diaChiEmail")}</span>
              <input type="email" value={profile.email} disabled />
            </label>
            <label className="field">
              <span>{translate("customer:profilePage_fullName")}</span>
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
              <span>{translate("customer:profilePage_phoneNumber")}</span>
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
                  {translate("customer:profilePage_cancel")}
                </button>
                <button className="button button-primary" type="submit" disabled={saving}>
                  {saving ? 'Saving...' : translate('customer:profilePage_saveChanges')}
                </button>
              </div>
            ) : null}
          </form>

          <aside className="profile-panel profile-summary" aria-label={translate("customer:profilePage_tomTatTaiKhoan")}>
            <div className="panel-heading">
              <div>
                <span>{translate("customer:profilePage_access")}</span>
                <h2>{translate("customer:profilePage_roleGuard")}</h2>
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
  useTranslation();
  if (orders.length === 0) {
    return (
      <div className="state-panel compact">
        <span className="state-icon" aria-hidden="true">
          ◇
        </span>
        <h2>{translate("customer:profilePage_chuaCoDonHang")}</h2>
        <p>{translate("customer:profilePage_cacDonMuaVeSeXuatHien")}</p>
      </div>
    );
  }

  return (
    <section className="history-list" aria-label={translate("customer:profilePage_lichSuDonHang")}>
      {orders.map((order) => (
        <OrderHistoryItem key={order.id} order={order} />
      ))}
    </section>
  );
}

function OrderHistoryItem({ order }: { order: OrderResponse }) {
  useTranslation();
  return (
    <article className="history-item" style={{ position: 'relative' }}>
      <div className="history-topline">
        <span>{translate("customer:profilePage_order")} {order.id.slice(0, 8).toUpperCase()}</span>
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
            <strong style={{ display: 'block', fontSize: 13, color: '#182133' }}>{translate("customer:profilePage_donDangChoThanhToan")}</strong>
            <span style={{ fontSize: 12, color: 'var(--muted)' }}>{translate("customer:profilePage_moLaiDonDeChonVaTiep")}</span>
          </div>
          <Link
            className="button button-primary"
            style={{ minHeight: 34, padding: '0 16px', fontSize: 12 }}
            to={`/checkout?orderId=${encodeURIComponent(order.id)}`}
          >
            {translate("customer:profilePage_tiepTucThanhToan")}
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
  useTranslation();
  if (tickets.length === 0) {
    return (
      <div className="state-panel compact">
        <span className="state-icon" aria-hidden="true">
          ◇
        </span>
        <h2>{translate("customer:profilePage_chuaCoVe")}</h2>
        <p>{translate("customer:profilePage_veDienTuVaMaQrSe")}</p>
      </div>
    );
  }

  return (
    <section className="ticket-history-grid" aria-label={translate("customer:profilePage_lichSuVe")}>
      {tickets.map((ticket) => (
        <article className="profile-ticket" key={ticket.id}>
          <div className="history-topline">
            <span>{translate("customer:profilePage_ticket")} {ticket.id.slice(0, 8).toUpperCase()}</span>
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
              <span>{translate("customer:profilePage_xuatTrinhMaQrTaiCuaSoat")}</span>
            </div>
          ) : null}
        </article>
      ))}
    </section>
  );
}
