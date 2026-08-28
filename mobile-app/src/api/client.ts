import axios, { AxiosError, InternalAxiosRequestConfig } from "axios";
import { apiConfig, assertApiConfigured } from "./config";
import { endpoints } from "./endpoints";
import { clearAuthStorage, getAccessToken, getRefreshToken, saveAccessToken, saveRefreshToken } from "./tokenStorage";
import { normalizeApiError } from "./errors";
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
  (response) => response,
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

    return Promise.reject(normalizeApiError(error));
  }
);
