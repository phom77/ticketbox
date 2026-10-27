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

const dateTime = new Intl.DateTimeFormat('vi-VN', {
  dateStyle: 'medium',
  timeStyle: 'short',
});

export function AdminNotificationsPage() {
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
            : 'Không thể tải vận hành thông báo.',
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
      setNotice(`Đã đưa thông báo ${item.id.slice(0, 8)} vào hàng chờ email.`);
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể thử gửi lại thông báo.',
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
      setNotice(`Đã tạo nhắc lịch cho ${result.data.recipients} người giữ vé hợp lệ.`);
      await load();
    } catch (requestError) {
      setError(
        requestError instanceof Error ? requestError.message : 'Không thể gửi nhắc lịch thủ công.',
      );
    } finally {
      setSendingReminder(false);
    }
  }

  return (
    <>
      <AdminPageHeader
        eyebrow="Vận hành thông báo"
        title="Vận hành thông báo"
        description="Theo dõi thông báo app/email, thử gửi lại email lỗi và kích hoạt nhắc lịch thủ công cho concert."
        actions={
          <button
            className="admin-secondary-action"
            type="button"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw aria-hidden="true" size={16} className={loading ? 'spin' : ''} />
            Làm mới
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
          <span>Nhắc lịch thủ công</span>
          <small>Chọn concert và gửi email nhắc lịch cho khách giữ vé hợp lệ.</small>
        </div>
        <ConcertPicker
          concerts={concerts}
          value={selectedConcertId}
          onChange={setSelectedConcertId}
          label="Concert gửi nhắc lịch"
          placeholder="Chọn concert"
          disabled={loading || !concerts.length}
        />
        <button
          className="admin-primary-action"
          type="button"
          onClick={() => void sendReminder()}
          disabled={!selectedConcertId || sendingReminder}
        >
          <Send aria-hidden="true" size={16} />
          {sendingReminder ? 'Đang gửi...' : 'Gửi nhắc lịch'}
        </button>
      </div>

      <section className="admin-data-panel">
        {loading ? (
          <div
            className="admin-row-skeleton"
            aria-label="Đang tải vận hành thông báo"
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
                  <th>Thông báo</th>
                  <th>Kênh</th>
                  <th>Trạng thái</th>
                  <th>Thời gian</th>
                  <th>
                    <span className="sr-only">Thao tác</span>
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
                        {item.status === 'SENT' ? 'ĐÃ GỬI' : item.status === 'FAILED' ? 'THẤT BẠI' : 'ĐANG CHỜ'}
                      </span>
                    </td>
                    <td>
                      <strong className="admin-table-primary">
                        {dateTime.format(new Date(item.createdAt))}
                      </strong>
                      <span className="admin-table-secondary">
                        {item.sentAt
                          ? `Đã gửi lúc ${dateTime.format(new Date(item.sentAt))}`
                          : 'Chưa gửi'}
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
                          Thử lại
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
            <h2>Chưa có thông báo</h2>
            <p>Thông báo sẽ xuất hiện sau khi thanh toán thành công hoặc tác vụ nhắc lịch chạy.</p>
          </div>
        )}
      </section>

      <div className="admin-toolbar">
        <div>
          <strong className="admin-table-primary">{notifications.length} thông báo gần nhất</strong>
          <span className="admin-table-secondary">{failedEmailCount} email lỗi có thể thử lại</span>
        </div>
      </div>
    </>
  );
}
