import { endpoints } from "@/api/endpoints";
import type { CashRegisterSession, CashTransactionType, DailyBalance } from "@/types/cashRegister";
import { api } from "./api";

export const cashRegisterService = {
  async current(): Promise<CashRegisterSession | null> {
    const { data } = await api.get<CashRegisterSession | null>(endpoints.cashRegister.current);
    return data;
  },

  async open(openingBalance: number): Promise<CashRegisterSession> {
    const { data } = await api.post<CashRegisterSession>(endpoints.cashRegister.open, { openingBalance });
    return data;
  },

  async close(actualBalance: number): Promise<CashRegisterSession> {
    const { data } = await api.patch<CashRegisterSession>(endpoints.cashRegister.close, { actualBalance });
    return data;
  },

  async adjustment(payload: { transactionType: Extract<CashTransactionType, "CASH_IN" | "CASH_OUT">; amount: number; description?: string }) {
    const { data } = await api.post<CashRegisterSession>(endpoints.cashRegister.adjustment, payload);
    return data;
  },

  async dailyBalance(): Promise<DailyBalance> {
    const { data } = await api.get<DailyBalance>(endpoints.cashRegister.dailyBalance);
    return data;
  }
};
