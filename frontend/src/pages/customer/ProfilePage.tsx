import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { ArrowUpRight, ClipboardList, Ticket, UserRound } from 'lucide-react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { api, ApiClientError } from '../../api/client';
import { getMyOrders, type Order, type OrderStatus } from '../../api/orders';
import { currency, dateFormatter } from '../../data/formatters';
import { useAuth, type UserSummary } from '../../features/auth/AuthContext';
import './ProfilePage.css';

type UserProfile = UserSummary & { phone: string | null };
type ProfileFeedback =
  | { kind: 'success'; message: string }
  | { kind: 'error'; message: string; field?: 'fullName' };

const orderStatusKeys = {
  AWAITING_PAYMENT: 'customer:profilePage_choThanhToan',
  PAID: 'customer:profilePage_daThanhToan',
  CANCELLED: 'customer:profilePage_daHuy',
  EXPIRED: 'customer:profilePage_hetHan',
  PAYMENT_FAILED: 'customer:profilePage_thanhToanLoi',
  REFUNDED: 'customer:profilePage_refunded',
} satisfies Record<OrderStatus, string>;

const orderFilters = [
  ['all', 'customer:profilePage_allOrders'],
  ['action', 'customer:profilePage_needsAction'],
  ['paid', orderStatusKeys.PAID],
  ['closed', 'customer:profilePage_closedOrders'],
] as const;
type OrderFilter = (typeof orderFilters)[number][0];

const dateTime = dateFormatter({ dateStyle: 'medium', timeStyle: 'short' });

function getProfile(signal: AbortSignal) {
  return api.get<unknown, UserProfile>('/api/users/me/profile', { signal });
}

function useAccountData<T>(load: (signal: AbortSignal) => Promise<T>) {
  const [state, setState] = useState<{ data: T } | { error: unknown }>();
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ data });
      })
      .catch((error) => {
        if (!controller.signal.aborted) setState({ error });
      });
    return () => controller.abort();
  }, [load, attempt]);

  return {
    state,
    retry() {
      setState(undefined);
      setAttempt((value) => value + 1);
    },
  };
}

export function ProfilePage() {
  const { t } = useTranslation();
  const { user, token } = useAuth();
  const [searchParams] = useSearchParams();
  const tab = searchParams.get('tab');
  if (tab === 'tickets') return <Navigate to="/my-tickets" replace />;

  const showOrders = tab === 'orders';
  const sessionKey = JSON.stringify([user?.id, token]);

  return (
    <div className="buyer-page page-width buyer-account">
      <header className="buyer-page-header">
        <h1>{t('customer:profilePage_accountTitle')}</h1>
        <Link className="button button-secondary" to="/my-tickets">
          <Ticket size={18} aria-hidden="true" />
          {t('customer:myTicketsPage_myTickets')}
        </Link>
      </header>
      <nav className="buyer-account-nav" aria-label={t('customer:profilePage_cacMucHoSo')}>
        <Link to="/profile" aria-current={showOrders ? undefined : 'page'}>
          <UserRound size={18} aria-hidden="true" />
          {t('customer:profilePage_hoSo')}
        </Link>
        <Link to="/profile?tab=orders" aria-current={showOrders ? 'page' : undefined}>
          <ClipboardList size={18} aria-hidden="true" />
          {t('customer:profilePage_lichSuDonHang')}
        </Link>
      </nav>
      {showOrders ? <OrderHistory key={sessionKey} /> : <ProfilePanel key={sessionKey} />}
    </div>
  );
}

function ProfilePanel() {
  const { t } = useTranslation();
  const { state, retry } = useAccountData(getProfile);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const profile = state && 'data' in state ? state.data : undefined;

  return (
    <section className="buyer-account-panel" aria-labelledby={headingId}>
      <h2 id={headingId} tabIndex={-1} ref={heading}>
        {t('customer:profilePage_personalDetails')}
      </h2>
      {!state ? (
        <p className="buyer-account-progress" role="status">
          {t('customer:profilePage_dangTaiHoSo')}
        </p>
      ) : null}
      {state && 'error' in state ? (
        <AccountLoadError
          title={t('customer:profilePage_khongTheMoHoSo')}
          fallback={t('customer:profilePage_khongTheTaiHoSo')}
          error={state.error}
          retry={() => {
            heading.current?.focus();
            retry();
          }}
        />
      ) : null}
      {profile ? <ProfileDetails initialProfile={profile} /> : null}
    </section>
  );
}

function ProfileDetails({ initialProfile }: { initialProfile: UserProfile }) {
  const { t } = useTranslation();
  const { updateUserSummary, token } = useAuth();
  const [profile, setProfile] = useState(initialProfile);
  const [fullName, setFullName] = useState(initialProfile.fullName);
  const [phone, setPhone] = useState(initialProfile.phone ?? '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<ProfileFeedback>();
  const feedbackId = useId();
  const invalidName = feedback?.kind === 'error' && feedback.field === 'fullName';
  const editor = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const returnToEditButton = useRef(false);
  const saveRequest = useRef<AbortController>();

  useEffect(() => () => saveRequest.current?.abort(), []);
  useEffect(() => {
    if (editing) {
      editor.current?.focus();
    } else if (returnToEditButton.current) {
      returnToEditButton.current = false;
      editButton.current?.focus();
    }
  }, [editing]);

  function edit() {
    setFeedback(undefined);
    setEditing(true);
  }

  function closeEditor(savedProfile: UserProfile) {
    setFullName(savedProfile.fullName);
    setPhone(savedProfile.phone ?? '');
    returnToEditButton.current = true;
    setEditing(false);
  }

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const nextName = fullName.trim();
    if (!nextName) {
      setFeedback({
        kind: 'error',
        message: t('customer:profilePage_vuiLongNhapHoTen'),
        field: 'fullName',
      });
      editor.current?.focus();
      return;
    }

    const controller = new AbortController();
    saveRequest.current = controller;
    setFeedback(undefined);
    setSaving(true);
    try {
      const updated = await api.patch<unknown, UserProfile>(
        '/api/users/me/profile',
        {
          fullName: nextName,
          phone: phone.trim() || null,
        },
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setProfile(updated);
      closeEditor(updated);
      updateUserSummary(
        { id: updated.id, email: updated.email, fullName: updated.fullName, role: updated.role },
        token,
      );
      setFeedback({
        kind: 'success',
        message: t('customer:profilePage_capNhatThongTinCaNhanThanh'),
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      setFeedback({
        kind: 'error',
        message:
          error instanceof ApiClientError
            ? error.message
            : t('customer:profilePage_capNhatThatBaiVuiLongThu'),
      });
    } finally {
      if (!controller.signal.aborted) setSaving(false);
    }
  }

  return (
    <>
      {feedback ? (
        <div
          id={feedbackId}
          className={`buyer-account-feedback is-${feedback.kind}`}
          role={feedback.kind === 'error' ? 'alert' : 'status'}
        >
          <span>{feedback.message}</span>
        </div>
      ) : null}
      {editing ? (
        <form
          className="buyer-account-form"
          onSubmit={save}
          aria-busy={saving}
          aria-describedby={feedback?.kind === 'error' ? feedbackId : undefined}
        >
          <label>
            <span>{t('customer:profilePage_fullName')}</span>
            <input
              autoComplete="name"
              ref={editor}
              required
              maxLength={255}
              value={fullName}
              readOnly={saving}
              aria-invalid={invalidName || undefined}
              aria-describedby={invalidName ? feedbackId : undefined}
              onChange={(event) => {
                setFullName(event.target.value);
                if (invalidName) setFeedback(undefined);
              }}
            />
          </label>
          <label>
            <span>{t('customer:profilePage_phoneNumber')}</span>
            <input
              type="tel"
              autoComplete="tel"
              maxLength={20}
              value={phone}
              readOnly={saving}
              onChange={(event) => setPhone(event.target.value)}
            />
          </label>
          <div className="buyer-account-actions">
            <button className="button button-primary" type="submit" aria-disabled={saving}>
              {t(saving ? 'customer:profilePage_saving' : 'customer:profilePage_saveChanges')}
            </button>
            <button
              className="button button-secondary"
              type="button"
              aria-disabled={saving}
              onClick={() => {
                if (saving) return;
                setFeedback(undefined);
                closeEditor(profile);
              }}
            >
              {t('customer:profilePage_cancel')}
            </button>
          </div>
        </form>
      ) : (
        <>
          <dl className="buyer-account-facts">
            <div>
              <dt>{t('customer:profilePage_fullName')}</dt>
              <dd>{profile.fullName}</dd>
            </div>
            <div>
              <dt>{t('customer:profilePage_diaChiEmail')}</dt>
              <dd>{profile.email}</dd>
            </div>
            <div>
              <dt>{t('customer:profilePage_phoneNumber')}</dt>
              <dd>{profile.phone || t('customer:profilePage_chuaCapNhat')}</dd>
            </div>
          </dl>
          <button className="button button-secondary" ref={editButton} type="button" onClick={edit}>
            {t('customer:profilePage_edit')}
          </button>
        </>
      )}
    </>
  );
}

function AccountLoadError({
  title,
  fallback,
  error,
  retry,
}: {
  title: string;
  fallback: string;
  error: unknown;
  retry: () => void;
}) {
  const { t } = useTranslation();
  const isForbidden = error instanceof ApiClientError && error.status === 403;
  return (
    <div className="buyer-state buyer-account-state" role="alert">
      <h3>{title}</h3>
      <p>{isForbidden ? t('customer:profilePage_taiKhoanHienTaiKhongCoQuyen') : fallback}</p>
      <button className="button button-secondary" type="button" onClick={retry}>
        {t('customer:profilePage_thuLai')}
      </button>
    </div>
  );
}

function orderDeadline(order: Order) {
  return Date.parse(order.expiresAt || '');
}

function displayedOrderStatus(order: Order, now: number): OrderStatus {
  return order.status === 'AWAITING_PAYMENT' && orderDeadline(order) <= now
    ? 'EXPIRED'
    : order.status;
}

function orderCategory(status: OrderStatus): Exclude<OrderFilter, 'all'> {
  if (status === 'AWAITING_PAYMENT') return 'action';
  return status === 'PAID' ? 'paid' : 'closed';
}

function useOrderTime(orders: Order[]) {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const nextExpiry = orders.reduce((next, order) => {
      const expiry = orderDeadline(order);
      return order.status === 'AWAITING_PAYMENT' && expiry > now ? Math.min(next, expiry) : next;
    }, Infinity);
    if (!Number.isFinite(nextExpiry)) return;
    const timeout = window.setTimeout(
      () => setNow(Date.now()),
      Math.max(0, Math.min(nextExpiry - Date.now(), 2_147_483_647)),
    );
    return () => window.clearTimeout(timeout);
  }, [now, orders]);
  return now;
}

function OrderHistory() {
  const { t } = useTranslation();
  const { state, retry } = useAccountData(getMyOrders);
  const heading = useRef<HTMLHeadingElement>(null);
  const headingId = useId();
  const orders = state && 'data' in state ? state.data : undefined;

  return (
    <section className="buyer-order-history" aria-labelledby={headingId}>
      <h2 id={headingId} tabIndex={-1} ref={heading}>
        {t('customer:profilePage_lichSuDonHang')}
      </h2>
      {!state ? (
        <p className="buyer-account-progress" role="status">
          {t('customer:profilePage_loadingOrders')}
        </p>
      ) : null}
      {state && 'error' in state ? (
        <AccountLoadError
          title={t('customer:profilePage_ordersUnavailable')}
          fallback={t('customer:profilePage_ordersRetryDetails')}
          error={state.error}
          retry={() => {
            heading.current?.focus();
            retry();
          }}
        />
      ) : null}
      {orders?.length === 0 ? (
        <div className="buyer-state buyer-account-state">
          <h3>{t('customer:profilePage_chuaCoDonHang')}</h3>
          <p>{t('customer:profilePage_cacDonMuaVeSeXuatHien')}</p>
          <Link className="button button-primary" to="/">
            {t('customer:myTicketsPage_browseEvents')}
          </Link>
        </div>
      ) : null}
      {orders?.length ? <OrderList orders={orders} /> : null}
    </section>
  );
}

function OrderList({ orders }: { orders: Order[] }) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<OrderFilter>('all');
  const allOrders = useRef<HTMLButtonElement>(null);
  const now = useOrderTime(orders);
  const rows = orders.map((order) => ({ order, status: displayedOrderStatus(order, now) }));
  const visible =
    filter === 'all' ? rows : rows.filter(({ status }) => orderCategory(status) === filter);

  return (
    <>
      <div
        className="buyer-filters"
        role="group"
        aria-label={t('customer:profilePage_orderStatus')}
      >
        {orderFilters.map(([value, key]) => (
          <button
            key={value}
            type="button"
            ref={value === 'all' ? allOrders : undefined}
            aria-pressed={filter === value}
            onClick={() => setFilter(value)}
          >
            {t(key)}
          </button>
        ))}
      </div>
      {visible.length > 0 ? (
        <div className="buyer-order-list">
          {visible.map(({ order, status }) => (
            <OrderCard key={order.id} order={order} status={status} />
          ))}
        </div>
      ) : (
        <div className="buyer-state buyer-account-state">
          <h3>{t('customer:profilePage_noMatchingOrders')}</h3>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => {
              setFilter('all');
              allOrders.current?.focus();
            }}
          >
            {t('customer:myTicketsPage_clearFilter')}
          </button>
        </div>
      )}
    </>
  );
}

function OrderCard({ order, status }: { order: Order; status: OrderStatus }) {
  const { t } = useTranslation();
  const headingId = useId();
  const orderId = encodeURIComponent(order.id);
  const concertId = order.concertId ? encodeURIComponent(order.concertId) : '';
  const deadline = orderDeadline(order);
  const canResume = status === 'AWAITING_PAYMENT' && Number.isFinite(deadline);
  const canCheck = !canResume && (status === 'AWAITING_PAYMENT' || status === 'EXPIRED');

  return (
    <article className="buyer-order-card" aria-labelledby={headingId}>
      <header className="buyer-order-header">
        <h3 id={headingId}>{order.concertTitle}</h3>
        <span className={`buyer-order-status status-${status.toLowerCase()}`}>
          {t(orderStatusKeys[status])}
        </span>
      </header>
      <dl className="buyer-order-facts">
        {order.referenceCode && (
          <div>
            <dt>{t('customer:profilePage_order')}</dt>
            <dd>{order.referenceCode}</dd>
          </div>
        )}
        <div>
          <dt>{t('customer:profilePage_orderDate')}</dt>
          <dd>
            <time dateTime={order.createdAt}>{dateTime.format(new Date(order.createdAt))}</time>
          </dd>
        </div>
        {canResume ? (
          <div>
            <dt>{t('customer:profilePage_reservedUntil')}</dt>
            <dd>
              <time dateTime={order.expiresAt}>{dateTime.format(deadline)}</time>
            </dd>
          </div>
        ) : null}
      </dl>
      <ul className="buyer-order-items">
        {order.items.map((item) => (
          <li key={item.id ?? item.ticketTypeId}>
            <span>
              {item.ticketTypeName} × {item.quantity}
            </span>
            <span>{currency.format(item.subtotal ?? item.unitPrice * item.quantity)}</span>
          </li>
        ))}
      </ul>
      <footer className="buyer-order-footer">
        <div className="buyer-order-total">
          <span>{t('customer:profilePage_orderTotal')}</span>
          <strong>{currency.format(order.totalAmount)}</strong>
        </div>
        {canResume ? (
          <Link className="button button-primary" to={`/checkout?orderId=${orderId}`}>
            {t('customer:profilePage_tiepTucThanhToan')}
          </Link>
        ) : null}
        {canCheck ? (
          <Link className="button button-secondary" to={`/payment/result?orderId=${orderId}`}>
            {t('customer:profilePage_checkPayment')}
          </Link>
        ) : null}
        {status === 'PAID' ? (
          <Link
            className="button button-secondary"
            to={concertId ? `/my-tickets?concertId=${concertId}` : '/my-tickets'}
          >
            {t(
              concertId
                ? 'customer:profilePage_viewEventTickets'
                : 'customer:myTicketsPage_myTickets',
            )}
            <ArrowUpRight size={17} aria-hidden="true" />
          </Link>
        ) : null}
      </footer>
    </article>
  );
}
