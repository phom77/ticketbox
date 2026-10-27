import axios, {
  AxiosError,
  AxiosHeaders,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
  type Method,
} from 'axios';

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
  config.baseURL = getApiBaseUrl();

  const headers = AxiosHeaders.from(config.headers);
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

  constructor(message: string, status: number, errors: ApiFieldError[] | null = null) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.errors = errors;
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

    throw new ApiClientError(error instanceof Error ? error.message : 'Network request failed', 0);
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

  return new ApiClientError(error.message || 'Network request failed', status);
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
