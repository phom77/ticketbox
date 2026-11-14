import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
  type Method,
} from 'axios';

import { currentLanguage } from '../i18n/preference';
import { getApiBaseUrl } from './config';
import { getAccessToken } from './tokenStorage';
import type { ApiFieldError, ApiResponse } from './types';

type JsonRequestOptions = {
  method?: Method;
  token?: string;
  body?: unknown;
};

export const apiClient = axios.create({
  headers: {
    Accept: 'application/json',
    'Content-Type': 'application/json',
  },
});

apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const admission = process.env.EXPO_PUBLIC_ADMISSION_API_BASE_URL;
  config.baseURL = config.url?.startsWith('/staff/') && admission
    ? admission.replace(/\/+$/, '')
    : getApiBaseUrl();
  config.timeout = 8000;

  const headers = AxiosHeaders.from(config.headers);
  headers.set('Accept-Language', currentLanguage());
  if (!headers.has('Authorization')) {
    const accessToken = await getAccessToken();
    if (accessToken) {
      headers.set('Authorization', `Bearer ${accessToken}`);
    }
  }

  config.headers = headers;
  return config;
});

export class ApiClientError extends Error {
  status: number;
  errors: ApiFieldError[] | null;
  unreachable: boolean;

  constructor(message: string, status: number, errors: ApiFieldError[] | null = null, unreachable = false) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.errors = errors;
    this.unreachable = unreachable;
  }
}

export async function requestJson<T>(path: string, options: JsonRequestOptions = {}): Promise<T> {
  const config: AxiosRequestConfig = {
    url: path,
    method: options.method ?? 'GET',
    headers: buildHeaders(options.token),
    data: options.body,
  };

  try {
    const response = await apiClient.request<ApiResponse<T>>(config);
    const payload = response.data;

    if (!isSuccessResponse(payload, response.status)) {
      throw new ApiClientError(payload.message || 'Request failed', response.status, payload.errors ?? null);
    }

    return payload.data;
  } catch (error) {
    if (error instanceof ApiClientError) {
      throw error;
    }

    if (axios.isAxiosError<ApiResponse<unknown>>(error)) {
      throw toApiClientError(error);
    }

    throw new ApiClientError(error instanceof Error ? error.message : 'Request failed', 0);
  }
}

function buildHeaders(token?: string) {
  const headers: Record<string, string> = {};

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  return headers;
}

function toApiClientError(error: AxiosError<ApiResponse<unknown>>) {
  const status = error.response?.status ?? 0;
  const payload = error.response?.data;

  if (payload) {
    return new ApiClientError(
      payload.message || `Request failed with status ${status}`,
      status,
      payload.errors ?? null,
    );
  }

  const unreachable = !error.response && (
    error.code === 'ERR_NETWORK' || error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT'
  );
  return new ApiClientError(error.message || 'Network request failed', status, null, unreachable);
}

function isSuccessResponse<T>(payload: ApiResponse<T>, httpStatus: number) {
  if (typeof payload.success === 'boolean') {
    return payload.success;
  }

  if (typeof payload.code === 'number') {
    return payload.code >= 200 && payload.code < 300;
  }

  return httpStatus >= 200 && httpStatus < 300;
}
