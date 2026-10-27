import { apiCommand, apiGet } from './client';
import type { Page } from './concerts';

export type NotificationStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';
export type NotificationChannel = 'APP' | 'EMAIL';

export type NotificationItem = {
  id: string;
  channel: NotificationChannel;
  eventType: string;
  subject: string;
  body: string;
  status: NotificationStatus;
  sentAt: string | null;
  readAt: string | null;
  read: boolean;
  createdAt: string;
};

export function getNotifications(page = 0, size = 20, signal?: AbortSignal) {
  return apiGet<Page<NotificationItem>>(`/api/notifications?page=${page}&size=${size}`, signal);
}

export function getUnreadNotificationCount(signal?: AbortSignal) {
  return apiGet<{ count: number }>('/api/notifications/unread-count', signal);
}

export function markNotificationRead(notificationId: string) {
  return apiCommand<NotificationItem>('patch', `/api/notifications/${encodeURIComponent(notificationId)}/read`);
}
