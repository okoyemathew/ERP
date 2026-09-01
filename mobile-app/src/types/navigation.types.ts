import type { NavigatorScreenParams } from "@react-navigation/native";
import type { Role } from "./domain.types";

export type AuthStackParamList = {
  Splash: undefined;
  Advert: undefined;
  Language: undefined;
  Onboarding: undefined;
  Login: undefined;
  ForgotPassword: undefined;
  ResetPassword: { emailOrPhone: string; token?: string };
  Register: undefined;
};

export type BottomTabParamList = {
  Dashboard: undefined;
  SalesRecords: undefined;
  AddNewSales: undefined;
  Customers: undefined;
  More: undefined;
  CreditSales: undefined;
  Expenses: undefined;
  Supplied: undefined;
  Notifications: undefined;
  Profile: undefined;
  Settings: undefined;
};

export type AppStackParamList = {
  Tabs: NavigatorScreenParams<BottomTabParamList>;
  CustomerDetail: { customerId: string };
  CustomerForm: { customerId?: string } | undefined;
  CreditSales: undefined;
  Employees: undefined;
  EmployeeDetail: { employeeId: string };
  EmployeeForm: { employeeId?: string } | undefined;
  Inventory: undefined;
  ProductDetail: { productId: string };
  ProductForm: { productId?: string } | undefined;
  ProductOptionManager: { kind: "category" | "brand" | "unit" };
  Expenses: undefined;
  Supplied: undefined;
  SupplierDetail: { supplierId: string };
  SupplierForm: { supplierId?: string } | undefined;
  Disbursed: undefined;
  PendingPayments: undefined;
  Reports: undefined;
  CashRegister: undefined;
  Settings: undefined;
  BusinessProfile: undefined;
  ReceiptSettings: undefined;
  TaxSettings: undefined;
  LanguageSettings: undefined;
  PrinterSettings: undefined;
  ThemeSettings: undefined;
  HelpSupport: undefined;
  AboutBusiness: undefined;
  NotificationSettings: undefined;
  Notifications: undefined;
  Profile: undefined;
};

export type RootStackParamList = {
  Auth: NavigatorScreenParams<AuthStackParamList>;
  App: { role: Role };
};
