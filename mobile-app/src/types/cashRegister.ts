export type CashRegisterStatus = "OPEN" | "CLOSED";
export type CashTransactionType =
  | "SALE"
  | "CREDIT_PAYMENT"
  | "EXPENSE"
  | "CASH_IN"
  | "CASH_OUT"
  | "OPENING_BALANCE"
  | "CLOSING_BALANCE";

export interface CashRegisterTransaction {
  id: string;
  transactionType: CashTransactionType;
  amount: string | number;
  reference?: string | null;
  description?: string | null;
  transactionDate: string;
}

export interface CashRegisterSession {
  id: string;
  businessId: string;
  userId: string;
  status: CashRegisterStatus;
  openingBalance: string | number;
  closingBalance?: string | number | null;
  expectedBalance: string | number;
  actualBalance?: string | number | null;
  difference?: string | number | null;
  openedAt: string;
  closedAt?: string | null;
  user: {
    id: string;
    name: string;
    username: string;
  };
  totals: {
    cashSales: string | number;
    cashExpenses: string | number;
    creditPayments: string | number;
    cashIn: string | number;
    cashOut: string | number;
  };
  transactions: CashRegisterTransaction[];
}

export interface DailyBalance {
  balanceDate: string;
  openingBalance: string | number;
  sales: string | number;
  expenses: string | number;
  cashReceived: string | number;
  cashPayments: string | number;
  creditPayments: string | number;
  nonCreditSalePayments: string | number;
  closingBalance: string | number;
}
