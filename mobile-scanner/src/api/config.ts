export const DEFAULT_API_BASE_URL = 'http://localhost:8080/api';

export const MAX_SYNC_BATCH_SIZE = readPositiveInteger(
  process.env.EXPO_PUBLIC_MAX_SYNC_BATCH_SIZE,
  500,
);

export const SCAN_DUPLICATE_WINDOW_MS = readPositiveInteger(
  process.env.EXPO_PUBLIC_SCAN_DUPLICATE_WINDOW_MS,
  3000,
);

let apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL || DEFAULT_API_BASE_URL).replace(/\/+$/, '');

export function getApiBaseUrl() {
  return apiBaseUrl;
}

export function setApiBaseUrl(baseUrl: string) {
  apiBaseUrl = baseUrl.replace(/\/+$/, '');
}

function readPositiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
