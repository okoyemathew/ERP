export interface DashboardSummary {
  totalSalesToday: number;
  totalRevenueToday: number;
  totalPaymentsToday: number;
  totalExpensesToday: number;
  todayProfit: number;
  costOfGoodsSoldToday: number;
  totalSales: number;
  totalOrders: number;
  totalProducts: number;
  totalExpenses: number;
  outstandingCreditBalance: number;
  activeCustomersCount: number;
  activeSuppliersCount: number;
  availableProductsCount: number;
  lowStockProductsCount: number;
  branchesCount: number;
  activeUsersCount: number;
  recentSales: Array<{
    id: string;
    saleNumber: string;
    saleDate: string;
    customerName: string;
    itemCount: number;
    totalAmount: number;
  }>;
  employeeSales: Array<{
    userId: string;
    name: string;
    username?: string | null;
    salesCount: number;
    totalSales: number;
  }>;
}

export interface DashboardStatistics {
  salesLast7Days: Array<{ date: string; revenue: number; salesCount: number }>;
  paymentsLast7Days: Array<{ date: string; amount: number }>;
  expensesLast7Days: Array<{ date: string; amount: number }>;
  averageDailyRevenue: number;
  creditSalesBalance: number;
}

export interface ReportResponse {
  reportType: string;
  period?: string;
  summary?: Record<string, unknown>;
  data?: unknown[];
  paymentBreakdown?: unknown[];
}
