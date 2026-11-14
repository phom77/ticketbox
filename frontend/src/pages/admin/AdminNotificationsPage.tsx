import { dateFormatter } from '../../data/formatters';
import { translate } from '../../i18n';
import { useTranslation } from 'react-i18next';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Bell, RefreshCw, RotateCw, Send } from 'lucide-react';
import {
  getAdminConcerts,
  getAdminNotifications,
  retryAdminNotification,
  sendAdminConcertReminder,
} from '../../api/admin';
import { isRequestCanceled } from '../../api/client';
import type { ConcertDetail } from '../../api/concerts';
import type { NotificationItem } from '../../api/notifications';
import { AdminPageHeader } from '../../components/admin/AdminPageHeader';
import { ConcertPicker } from '../../components/admin/ConcertPicker';

const dateTime = dateFormatter({
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function AdminNotificationsPage() {
  useTranslation();
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [concerts, setConcerts] = useState<ConcertDetail[]>([]);
  const [selectedConcertId, setSelectedConcertId] = useState('');
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const failedEmailCount = useMemo(
    () =>
      notifications.filter((item) => item.channel === 'EMAIL' && item.status === 'FAILED').length,
    [notifications],
  );

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError('');
    try {
      const [notificationPage, concertPage] = await Promise.all([
        getAdminNotifications(0, 50, signal),
        getAdminConcerts(0, 50, undefined, signal),
      ]);
      setNotifications(notificationPage.content);
      setConcerts(concertPage.content);
      setSelectedConcertId((current) => current || concertPage.content[0]?.id || '');
    } catch (requestError) {
      if (!isRequestCanceled(requestError)) {
        setError(
          requestError instanceof Error
            ? requestError.message
            : translate("admin:adminNotificationsPage_khongTheTaiVanHanhThongBao"),
        );
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

  async function retry(item: NotificationItem) {
    if (savingId) return;
    setSavingId(item.id);
    setError('');
    setNotice('');
    try {
      const result = await retryAdminNotification(item.id);
      setNotifications((current) =>
        current.map((existing) => (existing.id === item.id ? result.data : existing)),
      );
      setNotice(translate("admin:adminNotificationsPage_daDuaThongBaoVaoHangCho", { arg1: item.id.slice(0, 8) }));
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : translate("admin:adminNotificationsPage_khongTheThuGuiLaiThongBao"),
      );
    } finally {
      setSavingId(null);
    }
  }

  async function sendReminder() {
    if (!selectedConcertId || sendingReminder) return;
    setSendingReminder(true);
    setError('');
    setNotice('');
    try {
      const result = await sendAdminConcertReminder(selectedConcertId);
      setNotice(translate("admin:adminNotificationsPage_daTaoNhacLichChoNguoiGiu", { arg1: result.data.recipients }));
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : translate("admin:adminNotificationsPage_khongTheGuiNhacLichThuCong"),
      );
    } finally {
      setSendingReminder(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow={translate("admin:adminNotificationsPage_vanHanhThongBao")}
        title={translate("admin:adminNotificationsPage_vanHanhThongBao")}
        description={translate("admin:adminNotificationsPage_theoDoiThongBaoAppEmailThu")}
        actions={
          <button
            className="admin-secondary-action"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw aria-hidden="true" size={16} className={loading ? 'spin' : ''} />
            {translate("admin:adminNotificationsPage_lamMoi")}
          </button>
        }
      />

      {notice ? (
        <div className="admin-notice success" role="status">
          {notice}
        </div>
      ) : null}
      {error ? (
        <div className="admin-notice error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="admin-toolbar admin-reminder-toolbar">
        <div className="admin-reminder-copy">
          <span>{translate("admin:adminNotificationsPage_nhacLichThuCong")}</span>
          <small>{translate("admin:adminNotificationsPage_chonConcertVaGuiEmailNhacLich")}</small>
        </div>
        <ConcertPicker
          concerts={concerts}
          value={selectedConcertId}
          onChange={setSelectedConcertId}
          label={translate("admin:adminNotificationsPage_concertGuiNhacLich")}
          placeholder={translate("admin:adminNotificationsPage_chonConcert")}
          disabled={loading || !concerts.length}
        />
        <button
          className="admin-primary-action"
          type="button"
          onClick={() => void sendReminder()}
          disabled={!selectedConcertId || sendingReminder}
        >
          <Send aria-hidden="true" size={16} />
          {sendingReminder ? translate("admin:adminNotificationsPage_dangGui") : translate("admin:adminNotificationsPage_guiNhacLich")}
        </button>
      </div>

      <section className="admin-data-panel">
        {loading ? (
          <div
            className="admin-row-skeleton"
            aria-label={translate("admin:adminNotificationsPage_dangTaiVanHanhThongBao")}
            aria-live="polite"
          >
            {[1, 2, 3].map((item) => (
              <span key={item} />
            ))}
          </div>
        ) : notifications.length ? (
          <div className="admin-table-wrap">
            <table className="admin-table">
              <thead>
                <tr>
                  <th>{translate("admin:adminNotificationsPage_thongBao")}</th>
                  <th>{translate("admin:adminNotificationsPage_kenh")}</th>
                  <th>{translate("admin:adminNotificationsPage_trangThai")}</th>
                  <th>{translate("admin:adminNotificationsPage_thoiGian")}</th>
                  <th>
                    <span className="sr-only">{translate("admin:adminNotificationsPage_thaoTac")}</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {notifications.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong className="admin-table-primary">{item.subject}</strong>
                      <span className="admin-table-secondary">
                        {item.eventType} / {item.id.slice(0, 8)}
                      </span>
                    </td>
                    <td>
                      <strong className="admin-table-primary">{item.channel}</strong>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${item.status === 'FAILED' ? 'badge-error' : item.status === 'SENT' ? 'badge-success' : 'badge-warning'}`}
                      >
                        {item.status === 'SENT' ? translate("admin:adminNotificationsPage_daGui") : item.status === 'FAILED' ? translate("admin:adminNotificationsPage_thatBai") : translate("admin:adminNotificationsPage_dangCho")}
                      </span>
                    </td>
                    <td>
                      <strong className="admin-table-primary">
                        {dateTime.format(new Date(item.createdAt))}
                      </strong>
                      <span className="admin-table-secondary">
                        {item.sentAt
                          ? translate("admin:adminNotificationsPage_daGuiLuc", { arg1: dateTime.format(new Date(item.sentAt)) })
                          : translate("admin:adminNotificationsPage_chuaGui")}
                      </span>
                    </td>
                    <td>
                      {item.channel === 'EMAIL' && item.status === 'FAILED' ? (
                        <button
                          className="admin-secondary-action"
                          type="button"
                          disabled={savingId !== null}
                          onClick={() => void retry(item)}
                        >
                          <RotateCw
                            aria-hidden="true"
                            size={15}
                            className={savingId === item.id ? 'spin' : ''}
                          />
                          {translate("admin:adminNotificationsPage_thuLai")}
                        </button>
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="admin-empty-state">
            <Bell aria-hidden="true" size={28} />
            <h2>{translate("admin:adminNotificationsPage_chuaCoThongBao")}</h2>
            <p>{translate("admin:adminNotificationsPage_thongBaoSeXuatHienSauKhi")}</p>
          </div>
        )}
      </section>

      <div className="admin-toolbar">
        <div>
          <strong className="admin-table-primary">{notifications.length} {translate("admin:adminNotificationsPage_thongBaoGanNhat")}</strong>
          <span className="admin-table-secondary">{failedEmailCount} {translate("admin:adminNotificationsPage_emailLoiCoTheThuLai")}</span>
        </div>
      </div>
    </>
  );
}
