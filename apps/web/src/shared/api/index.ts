import axios from 'axios';
import { QueryClient } from '@tanstack/react-query';
import type { User } from '@carhistory/contracts';
export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 30000, retry: 1, refetchOnWindowFocus: false } },
});
export const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? '/api/v1',
  withCredentials: true,
  headers: { 'X-CSRF': '1' },
});
let accessToken: string | null = null;
let refreshPromise: Promise<{ user: User; accessToken: string }> | null = null;
let onExpired = () => {};
export const setExpiredHandler = (handler: () => void) => {
  onExpired = handler;
};
export const setAccessToken = (token: string | null) => {
  accessToken = token;
};
export async function refresh() {
  if (!refreshPromise)
    refreshPromise = api
      .post('/auth/refresh')
      .then((r) => {
        accessToken = r.data.accessToken;
        return r.data;
      })
      .finally(() => {
        refreshPromise = null;
      });
  return refreshPromise;
}
api.interceptors.request.use((config) => {
  if (accessToken) config.headers.Authorization = `Bearer ${accessToken}`;
  return config;
});
api.interceptors.response.use(
  (r) => r,
  async (error) => {
    const config = error.config;
    if (error.response?.status === 401 && !config?._retry && !String(config?.url).startsWith('/auth/')) {
      config._retry = true;
      try {
        await refresh();
        return api(config);
      } catch {
        accessToken = null;
        queryClient.clear();
        onExpired();
      }
    }
    throw error;
  },
);
export const get = <T = any>(url: string, signal?: AbortSignal) =>
  api.get<T>(url, { signal }).then((r) => r.data);
export const errorMessage = (error: any) =>
  error?.response?.data?.message ?? 'Не удалось выполнить запрос. Проверьте подключение.';
