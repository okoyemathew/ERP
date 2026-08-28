export const endpoints = {
  auth: {
    registerOwner: "/auth/register-owner",
    login: "/auth/login",
    refresh: "/auth/refresh",
    forgotPassword: "/auth/forgot-password",
    resetPassword: "/auth/reset-password",
    logout: "/auth/logout",
    logoutAll: "/auth/logout-all",
    me: "/auth/me",
    permissions: "/auth/permissions",
    changePassword: "/auth/password",
    sessions: "/auth/sessions",
    revokeSession: (sessionId: string) => `/auth/sessions/${sessionId}/revoke`
  },
  businesses: {
    detail: (businessId: string) => `/businesses/${businessId}`,
    update: (businessId: string) => `/businesses/${businessId}`,
    profile: (businessId: string) => `/businesses/${businessId}/profile`,
    config: (businessId: string) => `/businesses/${businessId}/config`,
    dashboardSummary: (businessId: string) => `/businesses/${businessId}/dashboard/summary`,
    dashboardStatistics: (businessId: string) => `/businesses/${businessId}/dashboard/statistics`,
    settings: (businessId: string) => `/businesses/${businessId}/settings`,
    receiptSettings: (businessId: string) => `/businesses/${businessId}/settings/receipt`,
    taxSettings: (businessId: string) => `/businesses/${businessId}/settings/tax`,
    notificationSettings: (businessId: string) => `/businesses/${businessId}/settings/notifications`,
    roles: (businessId: string) => `/businesses/${businessId}/roles`,
    permissions: (businessId: string) => `/businesses/${businessId}/permissions`
  },
  employees: {
    list: "/employees",
    create: "/employees",
    detail: (employeeId: string) => `/employees/${employeeId}`,
    profile: (employeeId: string) => `/employees/${employeeId}/profile`,
    sales: (employeeId: string) => `/employees/${employeeId}/sales`,
    salesPrint: (employeeId: string) => `/employees/${employeeId}/sales/print`,
    update: (employeeId: string) => `/employees/${employeeId}`,
    delete: (employeeId: string) => `/employees/${employeeId}`,
    setLoginAccess: (employeeId: string) => `/employees/${employeeId}/login-access`,
    assignRole: (employeeId: string) => `/employees/${employeeId}/role`,
    activate: (employeeId: string) => `/employees/${employeeId}/activate`,
    deactivate: (employeeId: string) => `/employees/${employeeId}/deactivate`,
    suspend: (employeeId: string) => `/employees/${employeeId}/suspend`,
    terminate: (employeeId: string) => `/employees/${employeeId}/terminate`
  },
  customers: {
    list: (businessId: string) => `/businesses/${businessId}/customers`,
    create: (businessId: string) => `/businesses/${businessId}/customers`,
    search: (businessId: string) => `/businesses/${businessId}/customers/search`,
    detail: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}`,
    profile: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/profile`,
    outstandingBalance: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/outstanding-balance`,
    outstandingCreditBalance: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/outstanding-credit-balance`,
    purchaseHistory: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/purchase-history`,
    salesHistory: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/sales-history`,
    paymentHistory: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/payment-history`,
    creditHistory: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/credit-history`,
    statement: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/statement`,
    collectCreditPayment: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/credit-payments`,
    validateCreditLimit: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/validate-credit-limit`,
    activate: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/activate`,
    deactivate: (businessId: string, customerId: string) => `/businesses/${businessId}/customers/${customerId}/deactivate`
  },
  sales: {
    list: "/sales",
    create: "/sales",
    receiptPrint: (receiptId: string) => `/receipts/${receiptId}/print`,
    receiptReprint: (receiptId: string) => `/receipts/${receiptId}/reprint`
  },
  creditSales: {
    list: "/credit-sales",
    create: "/credit-sales",
    payment: (creditSaleId: string) => `/credit-sales/${creditSaleId}/payments`
  },
  expenses: {
    list: "/expenses",
    create: "/expenses",
    detail: (expenseId: string) => `/expenses/${expenseId}`,
    update: (expenseId: string) => `/expenses/${expenseId}`,
    delete: (expenseId: string) => `/expenses/${expenseId}`,
    search: "/expenses/search",
    summary: "/expenses/summary",
    categories: "/expenses/categories",
    createCategory: "/expenses/categories"
  },
  cashRegister: {
    current: "/cash-register/current",
    open: "/cash-register/open",
    close: "/cash-register/close",
    adjustment: "/cash-register/adjustment",
    dailyBalance: "/cash-register/daily-balance",
    list: "/cash-register"
  },
  reports: {
    summary: "/reports/summary",
    dailySales: "/reports/sales/daily",
    weeklySales: "/reports/sales/weekly",
    monthlySales: "/reports/sales/monthly",
    yearlySales: "/reports/sales/yearly",
    profit: "/reports/profit",
    expenses: "/reports/expenses",
    inventory: "/reports/inventory",
    credit: "/reports/credits",
    employeeSales: "/reports/employees"
  },
  notifications: {
    list: "/notifications",
    markRead: (notificationId: string) => `/notifications/${notificationId}/read`,
    markAllRead: "/notifications/read-all"
  },
  sync: {
    batch: "/sync"
  },
  products: {
    list: (businessId: string) => `/businesses/${businessId}/products`,
    create: (businessId: string) => `/businesses/${businessId}/products`,
    detail: (businessId: string, productId: string) => `/businesses/${businessId}/products/${productId}`,
    search: (businessId: string) => `/businesses/${businessId}/products/search`,
    lowStock: (businessId: string) => `/businesses/${businessId}/products/low-stock`,
    available: (businessId: string) => `/businesses/${businessId}/products/available`,
    generateBarcode: (businessId: string) => `/businesses/${businessId}/products/barcode/generate`,
    addImage: (businessId: string, productId: string) => `/businesses/${businessId}/products/${productId}/images`,
    addBarcode: (businessId: string, productId: string) => `/businesses/${businessId}/products/${productId}/barcodes`
  },
  categories: {
    list: (businessId: string) => `/businesses/${businessId}/categories`,
    create: (businessId: string) => `/businesses/${businessId}/categories`,
    detail: (businessId: string, categoryId: string) => `/businesses/${businessId}/categories/${categoryId}`
  },
  brands: {
    list: (businessId: string) => `/businesses/${businessId}/brands`,
    create: (businessId: string) => `/businesses/${businessId}/brands`,
    detail: (businessId: string, brandId: string) => `/businesses/${businessId}/brands/${brandId}`
  },
  units: {
    list: (businessId: string) => `/businesses/${businessId}/units`,
    create: (businessId: string) => `/businesses/${businessId}/units`,
    detail: (businessId: string, unitId: string) => `/businesses/${businessId}/units/${unitId}`
  },
  suppliers: {
    list: (businessId: string) => `/businesses/${businessId}/suppliers`,
    create: (businessId: string) => `/businesses/${businessId}/suppliers`,
    search: (businessId: string) => `/businesses/${businessId}/suppliers/search`,
    detail: (businessId: string, supplierId: string) => `/businesses/${businessId}/suppliers/${supplierId}`,
    outstandingBalance: (businessId: string, supplierId: string) => `/businesses/${businessId}/suppliers/${supplierId}/outstanding-balance`,
    payments: (businessId: string, supplierId: string) => `/businesses/${businessId}/suppliers/${supplierId}/payments`,
    paymentHistory: (businessId: string, supplierId: string) => `/businesses/${businessId}/suppliers/${supplierId}/payment-history`,
    activate: (businessId: string, supplierId: string) => `/businesses/${businessId}/suppliers/${supplierId}/activate`,
    deactivate: (businessId: string, supplierId: string) => `/businesses/${businessId}/suppliers/${supplierId}/deactivate`
  },
  goodsDisbursements: {
    list: (businessId: string) => `/businesses/${businessId}/goods-disbursements`,
    create: (businessId: string) => `/businesses/${businessId}/goods-disbursements`,
    detail: (businessId: string, disbursementId: string) => `/businesses/${businessId}/goods-disbursements/${disbursementId}`
  }
} as const;
