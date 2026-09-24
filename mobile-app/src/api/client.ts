import axios, { AxiosError, AxiosResponse, InternalAxiosRequestConfig } from "axios";
import { apiConfig, assertApiConfigured } from "./config";
import { endpoints } from "./endpoints";
import { clearAuthStorage, getAccessToken, getAuthSession, getRefreshToken, saveAccessToken, saveRefreshToken } from "./tokenStorage";
import { normalizeApiError } from "./errors";
import { apiCacheKey, offlineApiCacheService } from "@/services/offline-api-cache.service";
import { dashboardEvents } from "@/utils/dashboardEvents";
import type { RefreshTokenResponse } from "@/types/auth";

type RetriableConfig = InternalAxiosRequestConfig & { _retry?: boolean; _cacheRevision?: number };

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

const isAccountingPrint = (url?: string) => /\/employees\/[^/]+\/sales\/print(?:\?|$)/.test(url ?? "");

async function scopedApiCacheKey(method?: string, url?: string, params?: unknown) {
  const session = await getAuthSession();
  return apiCacheKey(method, url, {
    scope: {
      businessId: session?.user.businessId ?? null,
      userId: session?.user.id ?? null
    },
    params: params ?? null
  });
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
  (config as RetriableConfig)._cacheRevision = offlineApiCacheService.getRevision();
  assertApiConfigured();
  const token = await getAccessToken();
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  async (response) => {
    if (response.config.method?.toUpperCase() === "POST" && /\/(?:credit-sales\/[^/]+\/(?:payments|pos-payments)|customers\/[^/]+\/credit-payments)$/.test(response.config.url ?? "")) {
      const session = await getAuthSession();
      if (session?.user.businessId) {
        await offlineApiCacheService.invalidateSaleReports(session.user.businessId).catch(() => undefined);
      }
      dashboardEvents.notifySaleChanged();
    }
    if (response.config.method?.toUpperCase() === "GET" && !isAccountingPrint(response.config.url)) {
      const cacheKey = await scopedApiCacheKey(response.config.method, response.config.url, response.config.params);
      void offlineApiCacheService.set(cacheKey, response.data, (response.config as RetriableConfig)._cacheRevision).catch(() => undefined);
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
    if (original?.method?.toUpperCase() === "GET" && !isAccountingPrint(original.url) && (apiError.code === "NETWORK" || apiError.code === "TIMEOUT")) {
      const cacheKey = await scopedApiCacheKey(original.method, original.url, original.params);
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
