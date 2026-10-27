import { api } from './client';

export type QueueStatus = 'WAITING_ROOM' | 'WAITING' | 'ADMITTED' | 'EXPIRED' | 'LEFT';

export type QueueStatusResponse = {
  status: QueueStatus;
  position: number | null;
  peopleAhead: number | null;
  estimatedWaitSeconds: number | null;
  queueAccessToken: string | null;
  sessionExpiresAt: string | null;
  waitingRoomCount: number;
  queueSize: number;
  activeShoppers: number;
};

export type QueueAdmission = {
  concertId: string;
  queueAccessToken: string;
  sessionExpiresAt: string;
};

const QUEUE_ADMISSION_STORAGE_KEY = 'ticketbox.queue-admission';

export function joinQueue(concertId: string, signal?: AbortSignal) {
  return api.post<unknown, QueueStatusResponse>(
    `/api/queue/concerts/${encodeURIComponent(concertId)}/join`,
    undefined,
    { signal },
  );
}

export function getQueueStatus(concertId: string, signal?: AbortSignal) {
  return api.get<unknown, QueueStatusResponse>(
    `/api/queue/concerts/${encodeURIComponent(concertId)}/status`,
    { signal },
  );
}

export function leaveQueue(concertId: string) {
  return api.post<unknown, QueueStatusResponse>(
    `/api/queue/concerts/${encodeURIComponent(concertId)}/leave`,
  );
}

export function storeQueueAdmission(concertId: string, status: QueueStatusResponse) {
  if (!status.queueAccessToken || !status.sessionExpiresAt) return null;
  const admission: QueueAdmission = {
    concertId,
    queueAccessToken: status.queueAccessToken,
    sessionExpiresAt: status.sessionExpiresAt,
  };
  sessionStorage.setItem(QUEUE_ADMISSION_STORAGE_KEY, JSON.stringify(admission));
  return admission;
}

export function getStoredQueueAdmission(concertId: string): QueueAdmission | null {
  const raw = sessionStorage.getItem(QUEUE_ADMISSION_STORAGE_KEY);
  if (!raw) return null;

  try {
    const admission = JSON.parse(raw) as QueueAdmission;
    if (admission.concertId !== concertId || !admission.queueAccessToken || !admission.sessionExpiresAt) {
      return null;
    }

    if (new Date(admission.sessionExpiresAt).getTime() <= Date.now()) {
      clearStoredQueueAdmission();
      return null;
    }

    return admission;
  } catch {
    clearStoredQueueAdmission();
    return null;
  }
}

export function clearStoredQueueAdmission() {
  sessionStorage.removeItem(QUEUE_ADMISSION_STORAGE_KEY);
}
