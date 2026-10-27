import axios, { AxiosError, type Method } from 'axios';
import { clearAuthToken, getAuthToken } from '../features/auth/tokenCookie';

declare module 'axios' {
  export interface AxiosRequestConfig {
    preserveEnvelope?: boolean;
  }

  export interface InternalAxiosRequestConfig {
    preserveEnvelope?: boolean;
  }
}

export const apiBaseUrl = (import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:8080').replace(/\/+$/, '');

type ApiEnvelope<T> = {
  code: number;
  message: string;
  data: T;
};

export type ApiCommandResult<T> = {
  data: T;
  message: string;
};

export class ApiClientError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiClientError';
  }
}

export function isRequestCanceled(error: unknown): boolean {
  return axios.isCancel(error) ||
    (error instanceof DOMException && error.name === 'AbortError');
}

export const api = axios.create({
  baseURL: apiBaseUrl,
  headers: { 'Content-Type': 'application/json' },
});

api.interceptors.request.use((config) => {
  const token = getAuthToken();
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  (response) => {
    const body = response.data;
    if (body && typeof body === 'object' && 'code' in body && 'data' in body) {
      const envelope = body as ApiEnvelope<unknown>;
      if (response.config.preserveEnvelope) {
        return { data: envelope.data, message: envelope.message };
      }
      return envelope.data;
    }
    return body;
  },
  (error: AxiosError<{ message?: string; details?: unknown }>) => {
    if (isRequestCanceled(error)) {
      throw error;
    }

    const status = error.response?.status ?? 500;
    if (status === 401) {
      clearAuthToken();
      if (!window.location.pathname.includes('/login')) {
        window.location.assign('/login');
      }
    }

    throw new ApiClientError(
      error.response?.data?.message ??
        (error.response ? 'Đã có lỗi xảy ra, vui lòng thử lại.' : 'Không thể kết nối tới máy chủ.'),
      status,
      error.response?.data?.details,
    );
  },
);

// Public reads deliberately omit Authorization so the shared proxy can cache them.
export const publicApi = axios.create({ baseURL: apiBaseUrl });
publicApi.interceptors.response.use(
  (response) => {
    const body = response.data;
    return body && typeof body === 'object' && 'data' in body && 'code' in body ? body.data : body;
  },
  (error: AxiosError<{ message?: string; details?: unknown }>) => {
    if (isRequestCanceled(error)) throw error;
    throw new ApiClientError(error.response?.data?.message ?? 'Không thể tải thông tin công khai.',
      error.response?.status ?? 503, error.response?.data?.details);
  },
);

export async function publicGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return publicApi.get<unknown, T>(path, { signal });
}

export async function apiGet<T>(path: string, signal?: AbortSignal): Promise<T> {
  return api.get<unknown, T>(path, { signal });
}

export async function apiCommand<T>(
  method: Method,
  path: string,
  data?: unknown,
): Promise<ApiCommandResult<T>> {
  return api.request<unknown, ApiCommandResult<T>>({
    method,
    url: path,
    data,
    preserveEnvelope: true,
  });
}

export async function apiMultipartCommand<T>(
  method: Method,
  path: string,
  data: FormData,
): Promise<ApiCommandResult<T>> {
  return api.request<unknown, ApiCommandResult<T>>({
    method,
    url: path,
    data,
    headers: { 'Content-Type': 'multipart/form-data' },
    preserveEnvelope: true,
  });
}

export function commandMessage(serverMessage: string, fallback: string) {
  const normalized = serverMessage.trim().toLowerCase();
  return normalized && !['success', 'created', 'accepted', 'thành công', 'đã tạo thành công', 'đã tiếp nhận yêu cầu'].includes(normalized)
    ? serverMessage
    : fallback;
}

export async function apiHealthCheck() {
  return apiGet<{ status: string; service: string }>('/api/health');
}
