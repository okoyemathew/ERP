import type { Role } from "@/types/domain.types";

const ownerOnly = new Set([
  "OwnerDashboard",
  "Inventory",
  "Employees",
  "EmployeeDetail",
  "PendingPayments",
  "Reports",
  "CashRegister",
  "Disbursed",
  "ProductDetail",
  "ProductForm",
  "ProductOptionManager",
  "EmployeeForm",
  "BusinessProfile",
  "ReceiptSettings",
  "TaxSettings",
  "PrinterSettings",
  "ThemeSettings"
]);

const employeeOnly = new Set(["EmployeeDashboard"]);

const employeeAllowed = new Set([
  "Tabs",
  "Dashboard",
  "SalesRecords",
  "AddNewSales",
  "Customers",
  "CustomerDetail",
  "CustomerForm",
  "CreditSales",
  "Expenses",
  "Supplied",
  "SupplierDetail",
  "Notifications",
  "Profile",
  "Settings",
  "NotificationSettings",
  "LanguageSettings",
  "HelpSupport",
  "AboutBusiness"
]);

export const canAccess = (role: Role, feature: string): boolean => {
  if (role === "owner") return !employeeOnly.has(feature);
  return employeeOnly.has(feature) || (employeeAllowed.has(feature) && !ownerOnly.has(feature));
};
