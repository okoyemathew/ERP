declare const process: { env?: Record<string, string | undefined> };

const trimTrailingSlash = (value: string) => value.replace(/\/+$/, "");

export const apiConfig = {
  baseURL: trimTrailingSlash(process.env?.EXPO_PUBLIC_API_BASE_URL ?? ""),
  timeoutMs: Number(process.env?.EXPO_PUBLIC_API_TIMEOUT_MS ?? 15000)
};

export function assertApiConfigured() {
  if (!apiConfig.baseURL) {
    throw new Error("API base URL is not configured. Set EXPO_PUBLIC_API_BASE_URL to your backend /api URL.");
  }

  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?/i.test(apiConfig.baseURL)) {
    throw new Error("API base URL cannot use localhost for a physical Android phone. Use your computer LAN IP backend /api URL.");
  }
}
