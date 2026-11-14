import { dateFormatter } from '../../data/formatters';
import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, CheckCircle2, Mail, RefreshCw, Smartphone, TicketCheck } from 'lucide-react';
import {
  getNotifications,
  markNotificationRead,
  type NotificationItem,
} from '../../api/notifications';
import { isRequestCanceled } from '../../api/client';

type NotificationFilter = 'all' | 'unread' | 'payment' | 'reminder';

const filters: Array<{ value: NotificationFilter; label: string }> = [
  { value: 'all', get label() { return translate("customer:notificationsPage_tatCa"); } },
  { value: 'unread', get label() { return translate("customer:notificationsPage_chuaDoc"); } },
  { value: 'payment', get label() { return translate("customer:notificationsPage_thanhToan"); } },
  { value: 'reminder', get label() { return translate("customer:notificationsPage_nhacLich"); } },
];

const dateTime = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function NotificationsPage() {
  useTranslation();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<NotificationFilter>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const page = await getNotifications(0, 50, signal);
      setItems(page.content);
    } catch (requestError) {
      if (!isRequestCanceled(requestError)) {
        setError(requestError instanceof Error ? requestError.message : translate("customer:notificationsPage_khongTheTaiThongBao"));
      }
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const unreadCount = items.filter((item) => !item.read && item.channel === 'APP').length;
  const emailCount = items.filter((item) => item.channel === 'EMAIL').length;
  const reminderCount = items.filter((item) => item.eventType === 'CONCERT_REMINDER').length;

  const visibleItems = useMemo(
    () =>
      items.filter((item) => {
        if (activeFilter === 'unread') return !item.read;
        if (activeFilter === 'payment') return item.eventType === 'PAYMENT_SUCCEEDED';
        if (activeFilter === 'reminder') return item.eventType === 'CONCERT_REMINDER';
        return true;
      }),
    [activeFilter, items],
  );

  async function markRead(item: NotificationItem) {
    if (item.read || savingId) return;
    setSavingId(item.id);
    try {
      const result = await markNotificationRead(item.id);
      setItems((current) =>
        current.map((existing) => (existing.id === item.id ? result.data : existing)),
      );
    } finally {
      setSavingId(null);
    }
  }

  return (
    <main className="notifications-page page-width">
      <section className="notifications-hero">
        <div>
          <p className="eyebrow">
            <span /> {translate("customer:notificationsPage_trungTamThongBao")}
          </p>
          <h1>{translate("customer:notificationsPage_thongBao")}</h1>
          <p>
            {translate("customer:notificationsPage_xacNhanThanhToanEmailVeVa")}
          </p>
        </div>
        <button
          className="button button-secondary"
          type="button"
          onClick={() => void load()}
          disabled={loading}
        >
          <RefreshCw size={16} className={loading ? 'spin' : ''} />
          {translate("customer:notificationsPage_lamMoi")}
        </button>
      </section>

      <section className="notification-summary-grid" aria-label={translate("customer:notificationsPage_tongQuanThongBao")}>
        <div>
          <span>{translate("customer:notificationsPage_appChuaDoc")}</span>
          <strong>{unreadCount}</strong>
        </div>
        <div>
          <span>{translate("customer:notificationsPage_emailDaTao")}</span>
          <strong>{emailCount}</strong>
        </div>
        <div>
          <span>{translate("customer:notificationsPage_nhacLich")}</span>
          <strong>{reminderCount}</strong>
        </div>
      </section>

      <div className="notification-tabs" role="tablist" aria-label={translate("customer:notificationsPage_boLocThongBao")}>
        {filters.map((filter) => (
          <button
            key={filter.value}
            type="button"
            role="tab"
            aria-selected={activeFilter === filter.value}
            className={activeFilter === filter.value ? 'active' : ''}
            onClick={() => setActiveFilter(filter.value)}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {error ? (
        <div className="state-panel compact" role="alert">
          <p>{error}</p>
        </div>
      ) : null}

      <section className="notification-feed" aria-label={translate("customer:notificationsPage_danhSachThongBao")}>
        {loading ? (
          <div className="profile-loading" role="status" aria-live="polite">
            <div className="route-spinner" aria-hidden="true" />
            <span>{translate("customer:notificationsPage_dangTaiThongBao")}</span>
          </div>
        ) : visibleItems.length ? (
          visibleItems.map((item) => (
            <NotificationCard
              key={item.id}
              item={item}
              saving={savingId === item.id}
              onMarkRead={() => void markRead(item)}
            />
          ))
        ) : (
          <div className="state-panel compact">
            <span className="state-icon" aria-hidden="true">
              ◇
            </span>
            <h2>{translate("customer:notificationsPage_khongCoThongBaoPhuHop")}</h2>
            <p>{translate("customer:notificationsPage_thuDoiBoLocHoacQuayLai")}</p>
          </div>
        )}
      </section>
    </main>
  );
}

function NotificationCard({
  item,
  saving,
  onMarkRead,
}: {
  item: NotificationItem;
  saving: boolean;
  onMarkRead: () => void;
}) {
  useTranslation();
  const Icon = item.eventType === 'CONCERT_REMINDER' ? Bell : TicketCheck;
  return (
    <article className={`notification-card ${item.read ? 'is-read' : 'is-new'}`}>
      <div className="notification-icon" aria-hidden="true">
        <Icon size={20} />
      </div>
      <div className="notification-content">
        <div className="notification-meta">
          <span className={`notification-channel channel-${item.channel.toLowerCase()}`}>
            {item.channel === 'EMAIL' ? <Mail size={13} /> : <Smartphone size={13} />}
            {item.channel}
          </span>
          <span>{eventLabel(item.eventType)}</span>
          <time dateTime={item.createdAt}>{dateTime.format(new Date(item.createdAt))}</time>
        </div>
        <h2>{item.subject}</h2>
        <p>{item.body}</p>
      </div>
      <div className="notification-actions">
        <span className={`status-chip ${item.read ? 'status-paid' : 'status-awaiting-payment'}`}>
          {item.read ? translate("customer:notificationsPage_daDoc") : translate("customer:notificationsPage_moi")}
        </span>
        {!item.read ? (
          <button
            className="button button-secondary"
            type="button"
            onClick={onMarkRead}
            disabled={saving}
          >
            <CheckCircle2 size={15} />
            {translate("customer:notificationsPage_daDoc")}
          </button>
        ) : null}
      </div>
    </article>
  );
}

function eventLabel(eventType: string) {
  if (eventType === 'PAYMENT_SUCCEEDED') return translate("customer:notificationsPage_xacNhanVe");
  if (eventType === 'CONCERT_REMINDER') return translate("customer:notificationsPage_nhacLich24h");
  return eventType.replace(/_/g, ' ').toLowerCase();
}
