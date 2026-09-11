import { endpoints } from "@/api/endpoints";
import { AppApiError } from "@/api/errors";
import { getRequiredAuthContext, getRequiredBusinessId } from "@/api/session";
import { offlineDbService } from "@/services/offline-db.service";
import { queueOfflineMutation } from "@/services/offline-mutation.service";
import { useAuthStore } from "@/store/authStore";
import type { CashRegisterSession, CashTransactionType, DailyBalance } from "@/types/cashRegister";
import { api } from "./api";

const toNumber = (value: string | number | null | undefined) => Number(value ?? 0);

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

function isOfflineError(error: unknown) {
  return error instanceof AppApiError && (error.code === "NETWORK" || error.code === "TIMEOUT");
}

function startOfToday() {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

function isToday(value: string) {
  return new Date(value) >= startOfToday();
}

async function queuedCashActivity() {
  const { businessId, userId } = await getRequiredAuthContext();
  const user = useAuthStore.getState().user;
  const [sales, expenses] = await Promise.all([
    offlineDbService.getQueuedOfflineSales(businessId, userId),
    offlineDbService.getQueuedOfflineExpensePayloads(businessId, userId)
  ]);
  const saleTransactions = sales.flatMap((sale) =>
    sale.payments
      .filter((payment) => payment.paymentMethod === "CASH" && Number(payment.amount ?? 0) > 0)
      .map((payment, index) => ({
        id: `${sale.id}-cash-${index}`,
        transactionType: "SALE" as const,
        amount: Number(payment.amount ?? 0),
        reference: sale.saleNumber,
        description: `Offline cash sale: ${sale.saleNumber}`,
        transactionDate: payment.paymentDate || sale.saleDate
      }))
  );
  const expenseTransactions = expenses
    .filter((expense) => expense.payload.paymentMethod === "CASH" && Number(expense.payload.amount ?? 0) > 0)
    .map((expense) => ({
      id: `${expense.id}-cash-expense`,
      transactionType: "EXPENSE" as const,
      amount: Number(expense.payload.amount ?? 0),
      reference: expense.payload.receiptNumber ?? expense.id,
      description: expense.payload.title,
      transactionDate: expense.payload.expenseDate ?? expense.createdAt
    }));
  const transactions = [...saleTransactions, ...expenseTransactions].sort(
    (left, right) => new Date(right.transactionDate).getTime() - new Date(left.transactionDate).getTime()
  );
  const cashSales = saleTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const cashExpenses = expenseTransactions.reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  return {
    businessId,
    userId,
    user,
    cashSales,
    cashExpenses,
    expectedBalance: Math.max(0, cashSales - cashExpenses),
    transactions
  };
}

async function offlineCurrentRegister(defaultWhenEmpty = false): Promise<CashRegisterSession | null> {
  const activity = await queuedCashActivity();
  if (activity.transactions.length === 0) {
    return defaultWhenEmpty ? localRegister(0) : null;
  }
  const now = new Date().toISOString();

  return {
    id: `offline-register-${activity.userId}`,
    businessId: activity.businessId,
    userId: activity.userId,
    status: "OPEN",
    openingBalance: 0,
    expectedBalance: activity.expectedBalance,
    actualBalance: null,
    difference: 0,
    openedAt: activity.transactions[activity.transactions.length - 1]?.transactionDate ?? now,
    closedAt: null,
    user: {
      id: activity.userId,
      name: activity.user?.name ?? activity.user?.username ?? "Current User",
      username: activity.user?.username ?? "offline"
    },
    totals: {
      cashSales: activity.cashSales,
      cashExpenses: activity.cashExpenses,
      creditPayments: 0,
      cashIn: 0,
      cashOut: 0
    },
    transactions: activity.transactions
  };
}

function mergeQueuedRegister(register: CashRegisterSession | null, queued: CashRegisterSession | null) {
  if (!queued) return register;
  if (!register) return queued;

  return {
    ...register,
    expectedBalance: toNumber(register.expectedBalance) + toNumber(queued.expectedBalance),
    totals: {
      ...register.totals,
      cashSales: toNumber(register.totals.cashSales) + toNumber(queued.totals.cashSales),
      cashExpenses: toNumber(register.totals.cashExpenses) + toNumber(queued.totals.cashExpenses)
    },
    transactions: [...queued.transactions, ...register.transactions]
  };
}

async function offlineDailyBalance(): Promise<DailyBalance> {
  const activity = await queuedCashActivity();
  const todayTransactions = activity.transactions.filter((transaction) => isToday(transaction.transactionDate));
  const sales = todayTransactions
    .filter((transaction) => transaction.transactionType === "SALE")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);
  const expenses = todayTransactions
    .filter((transaction) => transaction.transactionType === "EXPENSE")
    .reduce((sum, transaction) => sum + Number(transaction.amount), 0);

  return {
    balanceDate: startOfToday().toISOString(),
    openingBalance: 0,
    sales,
    expenses,
    cashReceived: sales,
    cashPayments: expenses,
    creditPayments: 0,
    nonCreditSalePayments: sales,
    closingBalance: Math.max(0, sales - expenses)
  };
}

function mergeDailyBalance(remote: DailyBalance, local: DailyBalance): DailyBalance {
  return {
    ...remote,
    sales: toNumber(remote.sales) + toNumber(local.sales),
    expenses: toNumber(remote.expenses) + toNumber(local.expenses),
    cashReceived: toNumber(remote.cashReceived) + toNumber(local.cashReceived),
    cashPayments: toNumber(remote.cashPayments) + toNumber(local.cashPayments),
    nonCreditSalePayments: toNumber(remote.nonCreditSalePayments) + toNumber(local.nonCreditSalePayments),
    closingBalance: toNumber(remote.closingBalance) + toNumber(local.closingBalance)
  };
}

export const cashRegisterService = {
  async current(): Promise<CashRegisterSession | null> {
    try {
      const { data } = await api.get<CashRegisterSession | null>(endpoints.cashRegister.current);
      return mergeQueuedRegister(data, await offlineCurrentRegister());
    } catch (error) {
      if (isOfflineError(error)) return offlineCurrentRegister(true);
      throw error;
    }
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
    try {
      const { data } = await api.get<DailyBalance>(endpoints.cashRegister.dailyBalance);
      return mergeDailyBalance(data, await offlineDailyBalance());
    } catch (error) {
      if (isOfflineError(error)) return offlineDailyBalance();
      throw error;
    }
  }
};
