import { endpoints } from "@/api/endpoints";
import { getRequiredBusinessId } from "@/api/session";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import { useAuthStore } from "@/store/authStore";
import type { CashRegisterSession, CashTransactionType, DailyBalance } from "@/types/cashRegister";
import { api } from "./api";

function localRegister(openingBalance: number, status: "OPEN" | "CLOSED" = "OPEN"): CashRegisterSession {
  const user = useAuthStore.getState().user;
  const now = new Date().toISOString();
  return {
    id: `register-${Date.now().toString(36)}`,
    businessId: user?.businessId ?? "offline-business",
    userId: user?.id ?? "offline-user",
    status,
    openingBalance,
    expectedBalance: openingBalance,
    actualBalance: status === "CLOSED" ? openingBalance : null,
    difference: 0,
    openedAt: now,
    closedAt: status === "CLOSED" ? now : null,
    user: {
      id: user?.id ?? "offline-user",
      name: user?.name ?? user?.username ?? "Current User",
      username: user?.username ?? "offline"
    },
    totals: { cashSales: 0, cashExpenses: 0, creditPayments: 0, cashIn: 0, cashOut: 0 },
    transactions: []
  };
}

export const cashRegisterService = {
  async current(): Promise<CashRegisterSession | null> {
    const { data } = await api.get<CashRegisterSession | null>(endpoints.cashRegister.current);
    return data;
  },

  async open(openingBalance: number): Promise<CashRegisterSession> {
    try {
      const { data } = await api.post<CashRegisterSession>(endpoints.cashRegister.open, { openingBalance });
      return data;
    } catch (error) {
      await getRequiredBusinessId();
      return queueOfflineMutation(error, { method: "POST", url: endpoints.cashRegister.open, data: { openingBalance } }, localRegister(openingBalance));
    }
  },

  async close(actualBalance: number): Promise<CashRegisterSession> {
    try {
      const { data } = await api.patch<CashRegisterSession>(endpoints.cashRegister.close, { actualBalance });
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "PATCH", url: endpoints.cashRegister.close, data: { actualBalance } }, localRegister(actualBalance, "CLOSED"));
    }
  },

  async adjustment(payload: { transactionType: Extract<CashTransactionType, "CASH_IN" | "CASH_OUT">; amount: number; description?: string }) {
    try {
      const { data } = await api.post<CashRegisterSession>(endpoints.cashRegister.adjustment, payload);
      return data;
    } catch (error) {
      return queueOfflineMutation(error, { method: "POST", url: endpoints.cashRegister.adjustment, data: payload }, localRegister(payload.amount));
    }
  },

  async dailyBalance(): Promise<DailyBalance> {
    const { data } = await api.get<DailyBalance>(endpoints.cashRegister.dailyBalance);
    return data;
  }
};
