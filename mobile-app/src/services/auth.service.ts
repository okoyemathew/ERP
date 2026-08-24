import { api } from "@/api/client";
import { endpoints } from "@/api/endpoints";
import { normalizeApiError } from "@/api/errors";
import { clearAuthStorage, getAuthSession, getRefreshToken, saveAccessToken, saveAuthSession, saveRefreshToken } from "@/api/tokenStorage";
import { deviceService } from "@/services/device.service";
import type {
  AuthProfileResponse,
  AuthSessionsResponse,
  ChangePasswordRequest,
  ForgotPasswordRequest,
  ForgotPasswordResponse,
  LoginRequest,
  LoginResponse,
  RegisterOwnerRequest,
  RegisterOwnerResponse,
  RefreshTokenResponse,
  ResetPasswordRequest,
  StoredAuthSession
} from "@/types/auth";
import { mapBackendUserToAppUser } from "@/types/auth";

function buildStoredSession(response: LoginResponse, profile?: AuthProfileResponse): StoredAuthSession {
  const profileUser = profile?.user ?? response.user;
  const user = mapBackendUserToAppUser({ ...profileUser, permissions: profile?.permissions ?? response.user.permissions }, response.accessToken);
  const roleName = profile?.role?.name ?? response.user.roleName;

  return {
    user,
    business: profile?.business ?? null,
    branch: profile?.branch ?? null,
    role: profile?.role ?? null,
    sessionId: profile?.session.id,
    roles: roleName ? [roleName] : [],
    permissions: profile?.permissions ?? response.user.permissions ?? [],
    accessToken: response.accessToken,
    refreshToken: response.refreshToken
  };
}

function withTokens(session: StoredAuthSession, tokens: RefreshTokenResponse): StoredAuthSession {
  return {
    ...session,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    user: {
      ...session.user,
      token: tokens.accessToken
    }
  };
}

export const authService = {
  async registerOwner(payload: RegisterOwnerRequest): Promise<RegisterOwnerResponse> {
    try {
      const { data } = await api.post<RegisterOwnerResponse>(endpoints.auth.registerOwner, payload);
      return data;
    } catch (error) {
      throw normalizeApiError(error);
    }
  },

  async login(credentials: LoginRequest): Promise<StoredAuthSession> {
    try {
      const deviceInfo = await deviceService.getDeviceInfo();
      const { data } = await api.post<LoginResponse>(endpoints.auth.login, {
        ...deviceInfo,
        ...credentials,
        deviceType: credentials.deviceType ?? deviceInfo.deviceType
      });

      await saveAccessToken(data.accessToken);
      await saveRefreshToken(data.refreshToken);

      const profile = await this.profile();
      const session = buildStoredSession(data, profile);
      await saveAuthSession(session);

      return session;
    } catch (error) {
      throw normalizeApiError(error);
    }
  },

  async forgotPassword(payload: ForgotPasswordRequest): Promise<ForgotPasswordResponse> {
    try {
      const { data } = await api.post<ForgotPasswordResponse>(endpoints.auth.forgotPassword, payload);
      return data;
    } catch (error) {
      throw normalizeApiError(error);
    }
  },

  async resetPassword(payload: ResetPasswordRequest): Promise<void> {
    try {
      await api.post(endpoints.auth.resetPassword, payload);
    } catch (error) {
      throw normalizeApiError(error);
    }
  },

  async restoreSession(): Promise<StoredAuthSession | null> {
    const session = await getAuthSession();
    const refreshToken = await getRefreshToken();

    if (!session || !refreshToken) {
      await clearAuthStorage();
      return null;
    }

    try {
      const { data } = await api.post<RefreshTokenResponse>(endpoints.auth.refresh, { refreshToken });
      const tokenSession = withTokens(session, data);

      await saveAccessToken(data.accessToken);
      await saveRefreshToken(data.refreshToken);

      const profile = await this.profile();
      const restoredSession: StoredAuthSession = {
        ...tokenSession,
        user: mapBackendUserToAppUser({ ...profile.user, permissions: profile.permissions }, data.accessToken),
        business: profile.business,
        branch: profile.branch,
        role: profile.role,
        sessionId: profile.session.id,
        roles: profile.role ? [profile.role.name] : [],
        permissions: profile.permissions
      };
      await saveAuthSession(restoredSession);

      return restoredSession;
    } catch {
      await clearAuthStorage();
      return null;
    }
  },

  async saveSession(session: StoredAuthSession): Promise<void> {
    await saveAuthSession(session);
  },

  async profile(): Promise<AuthProfileResponse> {
    const { data } = await api.get<AuthProfileResponse>(endpoints.auth.me);
    return data;
  },

  async refreshProfile(session: StoredAuthSession): Promise<StoredAuthSession> {
    const profile = await this.profile();
    const persistedSession = await getAuthSession();
    const refreshedSession: StoredAuthSession = {
      ...session,
      user: mapBackendUserToAppUser({ ...profile.user, permissions: profile.permissions }, session.accessToken),
      business: profile.business,
      branch: profile.branch,
      role: profile.role,
      sessionId: profile.session.id,
      roles: profile.role ? [profile.role.name] : [],
      permissions: profile.permissions,
      refreshToken: session.refreshToken || persistedSession?.refreshToken || ""
    };
    await saveAuthSession(refreshedSession);
    return refreshedSession;
  },

  async changePassword(payload: ChangePasswordRequest): Promise<void> {
    await api.patch(endpoints.auth.changePassword, payload);
  },

  async sessions() {
    const { data } = await api.get<AuthSessionsResponse>(endpoints.auth.sessions);
    return data.data;
  },

  async revokeSession(sessionId: string) {
    const { data } = await api.post<{ success: true; revokedCurrentSession: boolean }>(endpoints.auth.revokeSession(sessionId));
    if (data.revokedCurrentSession) {
      await clearAuthStorage();
    }
    return data;
  },

  async logout(): Promise<void> {
    try {
      await api.post(endpoints.auth.logout);
    } catch {
      // Local logout should still succeed if the server is unreachable.
    } finally {
      await clearAuthStorage();
    }
  },

  async logoutAll(): Promise<void> {
    try {
      await api.post(endpoints.auth.logoutAll);
    } catch {
      // Local logout should still succeed if the server is unreachable.
    } finally {
      await clearAuthStorage();
    }
  },

  async clearLocalSession(): Promise<void> {
    await clearAuthStorage();
  }
};
