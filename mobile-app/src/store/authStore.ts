import { create } from "zustand";
import { hasCompletedOnboarding } from "@/api/authFlowStorage";
import { setUnauthorizedHandler } from "@/api/client";
import { authService } from "@/services/auth.service";
import type { AuthBranch, AuthBusiness, AuthRole, AuthSessionDevice, ChangePasswordRequest, LoginRequest, StoredAuthSession } from "@/types/auth";
import type { User } from "@/types/domain.types";

interface AuthStore {
  user: User | null;
  business: AuthBusiness | null;
  branch: AuthBranch | null;
  role: AuthRole | null;
  sessionId: string | null;
  sessions: AuthSessionDevice[];
  roles: string[];
  permissions: string[];
  accessToken: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  isSessionLoading: boolean;
  hasRestored: boolean;
  authEntryRoute: "Splash" | "Login";
  error: string | null;
  restore: () => Promise<void>;
  login: (credentials: LoginRequest) => Promise<void>;
  refreshProfile: () => Promise<void>;
  changePassword: (payload: ChangePasswordRequest) => Promise<void>;
  loadSessions: () => Promise<void>;
  revokeSession: (sessionId: string) => Promise<void>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  clearAuth: () => Promise<void>;
  can: (permission: string) => boolean;
  canAny: (permissions: string[]) => boolean;
  canAction: (resource: string, action: "view" | "create" | "update" | "delete" | "manage") => boolean;
}

function toStoreSession(session: StoredAuthSession) {
  return {
    user: session.user,
    business: session.business,
    branch: session.branch ?? null,
    role: session.role ?? null,
    sessionId: session.sessionId ?? null,
    roles: session.roles,
    permissions: session.permissions,
    accessToken: session.accessToken,
    isAuthenticated: true,
    isLoading: false,
    hasRestored: true,
    authEntryRoute: "Login" as const,
    error: null
  };
}

function emptyAuthState(authEntryRoute: "Splash" | "Login" = "Login") {
  return {
    user: null,
    business: null,
    branch: null,
    role: null,
    sessionId: null,
    sessions: [],
    roles: [],
    permissions: [],
    accessToken: null,
    isAuthenticated: false,
    isLoading: false,
    isSessionLoading: false,
    hasRestored: true,
    authEntryRoute,
    error: null
  };
}

export const useAuthStore = create<AuthStore>((set, get) => ({
  user: null,
  business: null,
  branch: null,
  role: null,
  sessionId: null,
  sessions: [],
  roles: [],
  permissions: [],
  accessToken: null,
  isAuthenticated: false,
  isLoading: true,
  isSessionLoading: false,
  hasRestored: false,
  authEntryRoute: "Splash",
  error: null,

  restore: async () => {
    set({ isLoading: true, error: null });
    const session = await authService.restoreSession();

    if (!session) {
      set(emptyAuthState((await hasCompletedOnboarding()) ? "Login" : "Splash"));
      return;
    }

    set(toStoreSession(session));
  },

  login: async (credentials) => {
    set({ isLoading: true, error: null });
    try {
      const session = await authService.login(credentials);
      set(toStoreSession(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Login failed. Please try again.";
      set({
        ...emptyAuthState("Login"),
        error: message
      });
      throw error;
    }
  },

  refreshProfile: async () => {
    const current = get();
    if (!current.accessToken || !current.user) return;

    set({ isLoading: true, error: null });
    try {
      const session = await authService.refreshProfile({
        user: current.user,
        business: current.business,
        branch: current.branch,
        role: current.role,
        sessionId: current.sessionId ?? undefined,
        roles: current.roles,
        permissions: current.permissions,
        accessToken: current.accessToken,
        refreshToken: ""
      });
      set(toStoreSession(session));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to refresh profile.";
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  changePassword: async (payload) => {
    set({ isLoading: true, error: null });
    try {
      await authService.changePassword(payload);
      set({ isLoading: false, error: null });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to change password.";
      set({ isLoading: false, error: message });
      throw error;
    }
  },

  loadSessions: async () => {
    set({ isSessionLoading: true, error: null });
    try {
      const sessions = await authService.sessions();
      set({ sessions, isSessionLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load sessions.";
      set({ isSessionLoading: false, error: message });
      throw error;
    }
  },

  revokeSession: async (sessionId) => {
    set({ isSessionLoading: true, error: null });
    try {
      const result = await authService.revokeSession(sessionId);
      if (result.revokedCurrentSession) {
        set(emptyAuthState("Login"));
        return;
      }
      const sessions = await authService.sessions();
      set({ sessions, isSessionLoading: false });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to revoke session.";
      set({ isSessionLoading: false, error: message });
      throw error;
    }
  },

  logout: async () => {
    set({ isLoading: true, error: null });
    await authService.logout();
    set(emptyAuthState("Login"));
  },

  logoutAll: async () => {
    set({ isLoading: true, error: null });
    await authService.logoutAll();
    set(emptyAuthState("Login"));
  },

  clearAuth: async () => {
    await authService.clearLocalSession();
    set(emptyAuthState("Login"));
  },

  can: (permission) => get().permissions.includes(permission),

  canAny: (permissions) => permissions.some((permission) => get().permissions.includes(permission)),

  canAction: (resource, action) => {
    const permissions = get().permissions;
    const exactPermission = `${resource}.${action}`;
    const managePermission = `${resource}.manage`;
    return permissions.includes(exactPermission) || permissions.includes(managePermission);
  }
}));

setUnauthorizedHandler(() => {
  void useAuthStore.getState().clearAuth();
});
