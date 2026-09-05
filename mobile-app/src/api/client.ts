import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { apiConfig, assertApiConfigured } from "./config";
import { endpoints } from "./endpoints";
import { clearAuthStorage, getAccessToken, getRefreshToken, saveAccessToken, saveRefreshToken } from "./tokenStorage";
import { normalizeApiError } from "./errors";
import { apiCacheKey, offlineApiCacheService } from "@/services/offline-api-cache.service";
import type { RefreshTokenResponse } from "@/types/auth";

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean };

let unauthorizedHandler: (() => void) | undefined;
let refreshPromise: Promise<string | null> | null = null;
const publicAuthEndpoints = new Set<string>([
  endpoints.auth.login,
  endpoints.auth.registerOwner,
  endpoints.auth.forgotPassword,
  endpoints.auth.resetPassword,
  endpoints.auth.refresh
]);

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

function isPublicAuthEndpoint(url?: string) {
  if (!url) return false;

  try {
    const path = url.startsWith("http") ? new URL(url).pathname.replace(/^\/api/, "") : url;
    return publicAuthEndpoints.has(path);
  } catch {
    return publicAuthEndpoints.has(url);
  }
}

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
  (response) => {
    if (response.config.method?.toUpperCase() === "GET") {
      const cacheKey = apiCacheKey(response.config.method, response.config.url, response.config.params);
      void offlineApiCacheService.set(cacheKey, response.data).catch(() => undefined);
    }
    return response;
  },
  async (error: AxiosError) => {
    const original = error.config as RetriableConfig | undefined;
    const publicAuthEndpoint = isPublicAuthEndpoint(original?.url);

    if (error.response?.status === 401 && original && !original._retry && !publicAuthEndpoint) {
      original._retry = true;
      const refreshedToken = await refreshAccessToken();
      if (refreshedToken) {
        original.headers.Authorization = `Bearer ${refreshedToken}`;
        return api(original);
      }
    }

    if (error.response?.status === 401 && !publicAuthEndpoint) {
      await clearAuthStorage();
      unauthorizedHandler?.();
    }

    const apiError = normalizeApiError(error);
    if (original?.method?.toUpperCase() === "GET" && (apiError.code === "NETWORK" || apiError.code === "TIMEOUT")) {
      const cacheKey = apiCacheKey(original.method, original.url, original.params);
      const cached = await offlineApiCacheService.get(cacheKey);
      if (cached !== null) {
        return {
          data: cached,
          status: 200,
          statusText: "OK",
          headers: {},
          config: original,
          request: error.request
        } satisfies AxiosResponse;
      }
    }

    return Promise.reject(apiError);
  }
);
