import { message } from 'antd';
import { useAuthStore } from '../store/authStore';
import { ApiResponse } from '../../shared/types';

const BASE_URL = '/api';

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export const request = async <T = unknown>(
  url: string,
  options: RequestOptions = {}
): Promise<T> => {
  const { skipAuth, headers, ...rest } = options;
  const token = useAuthStore.getState().token;

  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
  };

  if (!skipAuth && token) {
    defaultHeaders['Authorization'] = `Bearer ${token}`;
  }

  try {
    const response = await fetch(`${BASE_URL}${url}`, {
      ...rest,
      headers: {
        ...defaultHeaders,
        ...headers,
      },
    });

    const data = await response.json() as ApiResponse<T>;

    if (!response.ok) {
      if (response.status === 401) {
        useAuthStore.getState().clearAuth();
        if (window.location.pathname !== '/login') {
          window.location.href = '/login';
        }
      }
      const errorMsg = data.error || `请求失败 (${response.status})`;
      message.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (!data.success) {
      const errorMsg = data.error || '操作失败';
      message.error(errorMsg);
      throw new Error(errorMsg);
    }

    if (data.message) {
      message.success(data.message);
    }

    return data.data as T;
  } catch (err) {
    if (err instanceof Error) {
      throw err;
    }
    const errorMsg = '网络请求失败，请检查网络连接';
    message.error(errorMsg);
    throw new Error(errorMsg);
  }
};

export const downloadFile = async (url: string, params?: Record<string, unknown>): Promise<void> => {
  const token = useAuthStore.getState().token;
  const queryString = params
    ? '?' + new URLSearchParams(params as Record<string, string>).toString()
    : '';

  const response = await fetch(`${BASE_URL}${url}${queryString}`, {
    headers: {
      'Authorization': `Bearer ${token}`,
    },
  });

  if (!response.ok) {
    const data = await response.json() as ApiResponse;
    message.error(data.error || '导出失败');
    throw new Error(data.error || '导出失败');
  }

  const blob = await response.blob();
  const disposition = response.headers.get('Content-Disposition');
  let filename = 'export.csv';
  if (disposition) {
    const match = disposition.match(/filename="?([^"]+)"?/);
    if (match) {
      filename = match[1];
    }
  }

  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(link.href);
};
