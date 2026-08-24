import * as SecureStore from "expo-secure-store";
import type { StoredAuthSession } from "@/types/auth";

const ACCESS_TOKEN_KEY = "smartpos.accessToken";
const REFRESH_TOKEN_KEY = "smartpos.refreshToken";
const AUTH_SESSION_KEY = "smartpos.authSession";
const LEGACY_JWT_KEY = "nexpos.jwt";

export async function saveAccessToken(token: string) {
  await SecureStore.setItemAsync(ACCESS_TOKEN_KEY, token);
}

export async function getAccessToken() {
  return SecureStore.getItemAsync(ACCESS_TOKEN_KEY);
}

export async function removeAccessToken() {
  await SecureStore.deleteItemAsync(ACCESS_TOKEN_KEY);
  await SecureStore.deleteItemAsync(LEGACY_JWT_KEY);
}

export async function saveRefreshToken(token: string) {
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

export async function getRefreshToken() {
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

export async function removeRefreshToken() {
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

export async function saveAuthSession(session: StoredAuthSession) {
  await SecureStore.setItemAsync(AUTH_SESSION_KEY, JSON.stringify(session));
}

export async function getAuthSession(): Promise<StoredAuthSession | null> {
  const raw = await SecureStore.getItemAsync(AUTH_SESSION_KEY);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as StoredAuthSession;
  } catch {
    await SecureStore.deleteItemAsync(AUTH_SESSION_KEY);
    return null;
  }
}

export async function clearAuthStorage() {
  await Promise.all([
    removeAccessToken(),
    removeRefreshToken(),
    SecureStore.deleteItemAsync(AUTH_SESSION_KEY)
  ]);
}
