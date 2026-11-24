import { apiCommand, apiGet } from '../client';
import type { Page } from '../concerts';
import type { NotificationItem } from '../notifications';

// ---- Admin Notification Operations ----

export function getAdminNotifications(page = 0, size = 20, signal?: AbortSignal) {
  return apiGet<Page<NotificationItem>>(
    `/api/admin/notifications?page=${page}&size=${size}`,
    signal,
  );
}

export function retryAdminNotification(notificationId: string) {
  return apiCommand<NotificationItem>(
    'post',
    `/api/admin/notifications/${encodeURIComponent(notificationId)}/retry`,
  );
}

export function sendAdminConcertReminder(concertId: string) {
  return apiCommand<{ recipients: number }>(
    'post',
    `/api/admin/concerts/${encodeURIComponent(concertId)}/reminders/send`,
  );
}
