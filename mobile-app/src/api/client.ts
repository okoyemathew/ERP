import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { apiConfig, assertApiConfigured } from "./config";
import { endpoints } from "./endpoints";
import { clearAuthStorage, getAccessToken, getRefreshToken, saveAccessToken, saveRefreshToken } from "./tokenStorage";
import { normalizeApiError } from "./errors";
import type { RefreshTokenResponse } from "@/types/auth";

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let unauthorizedHandler: (() => void) | undefined;
let refreshPromise: Promise<string | null> | null = null;

export function setUnauthorizedHandler(handler: () => void) {
  unauthorizedHandler = handler;
}

export const api = axios.create({
  baseURL: apiConfig.baseURL,
  timeout: apiConfig.timeoutMs,
  headers: {
    Accept: "application/json",
    "Content-Type": "application/json"
  }
});

async function refreshAccessToken() {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    const refreshToken = await getRefreshToken();
    if (!refreshToken) return null;

    try {
      assertApiConfigured();
      const { data } = await axios.post<RefreshTokenResponse>(`${apiConfig.baseURL}${endpoints.auth.refresh}`, { refreshToken }, { timeout: apiConfig.timeoutMs });
      await saveAccessToken(data.accessToken);
      await saveRefreshToken(data.refreshToken);
      return data.accessToken;
    } catch {
      await clearAuthStorage();
      unauthorizedHandler?.();
      return null;
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

api.interceptors.request.use(async (config) => {
  assertApiConfigured();
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;

    if (error.response?.status === 401 && original && !original._retry && original.url !== endpoints.auth.refresh) {
      original._retry = true;
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        original.headers.Authorization = `Bearer ${refreshedToken}`;
        return api(original);
      }
    }

    if (error.response?.status === 401) {
      await clearAuthStorage();
      unauthorizedHandler?.();
    }

    return Promise.reject(normalizeApiError(error));
  }
);
