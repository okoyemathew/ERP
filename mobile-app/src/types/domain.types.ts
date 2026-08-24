export type Role = "owner" | "employee";
export type PaymentMethod = "cash" | "card" | "mobile" | "bank" | "credit";

export interface User {
  id: string;
  name: string;
  role: Role;
  token: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  email?: string | null;
  phone?: string | null;
  profileImage?: string | null;
  status?: string;
  businessId?: string;
  branchId?: string | null;
  roleId?: string | null;
  roleName?: string | null;
  employeeId?: string | null;
  permissions?: string[];
}

export interface Product {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  cost: number;
  stock: number;
  floorPrice?: number;
  iconColor: string;
  supplier?: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  status: "Active" | "Inactive" | "On Leave";
  phone: string;
  username: string;
  totalSales: number;
  stock: EmployeeStockItem[];
}

export interface EmployeeStockItem {
  productId: string;
  name: string;
  qtyInHand: number;
  floorPrice: number;
  iconColor: string;
}

export interface Customer {
  id: string;
  name: string;
  phone: string;
  totalSpent: number;
  outstanding: number;
  lastPurchase: string;
}

export interface SaleItem {
  productId: string;
  name: string;
  qty: number;
  price: number;
}

export interface Sale {
  id: string;
  orderNumber: string;
  customerId?: string;
  customerName?: string;
  items: SaleItem[];
  total: number;
  status: "completed" | "pending" | "refunded";
  paymentMethod: PaymentMethod;
  createdAt: string;
  employeeId?: string;
}

export interface CreditInvoice {
  id: string;
  customerId: string;
  customerName: string;
  orderNumber: string;
  items: SaleItem[];
  total: number;
  amountPaid: number;
  remaining: number;
  createdAt: string;
  dueDate: string;
  status: "pending" | "partial" | "paid";
  employeeId?: string;
  employeeName?: string;
  payments: CreditPayment[];
}

export interface CreditPayment {
  id: string;
  invoiceId: string;
  customerId: string;
  amount: number;
  method: Exclude<PaymentMethod, "credit">;
  createdAt: string;
  employeeId?: string;
  employeeName?: string;
  status: "confirmed";
  receiptId: string;
}

export interface ReceiptDocument {
  id: string;
  kind: "sale" | "credit" | "payment";
  title: string;
  orderNumber: string;
  customerName: string;
  employeeName?: string;
  items: SaleItem[];
  subtotal: number;
  tax: number;
  total: number;
  paid: number;
  balance: number;
  method: PaymentMethod | Exclude<PaymentMethod, "credit">;
  createdAt: string;
  printed: boolean;
}

export interface Expense {
  id: string;
  category: string;
  label: string;
  amount: number;
  date: string;
}

export interface Notification {
  id: string;
  type: "sale" | "payment" | "stock" | "employee" | "system";
  title: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface PendingPayment {
  id: string;
  customerName: string;
  invoiceId: string;
  amount: number;
  employee: string;
  method: "cash" | "card" | "mobile";
}
