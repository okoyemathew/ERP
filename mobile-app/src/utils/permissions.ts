import type { Role, User } from "@/types/domain.types";

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

const employeeOnly = new Set(["EmployeeDashboard", "EmployeeSelfProfile"]);

const employeeAllowed = new Set([
  "Tabs",
  "Dashboard",
  "SalesRecords",
  "AddNewSales",
  "Customers",
  "CustomerDetail",
  "CreditCustomerDetails",
  "CustomerForm",
  "CreditSales",
  "ReturnedProducts",
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

export const appRoleForUser = (user: User | null | undefined): Role => {
  const normalizedRoleName = user?.roleName?.trim().toLowerCase();

  if (normalizedRoleName === "owner") {
    return "owner";
  }

  if (normalizedRoleName) {
    return "employee";
  }

  return user?.role ?? "employee";
};

export const canReviewProductReturns = (user: User | null | undefined): boolean => {
  const normalizedRoleName = user?.roleName?.trim().toLowerCase();

  return Boolean(
    normalizedRoleName === "owner" ||
      normalizedRoleName === "admin" ||
      normalizedRoleName === "administrator" ||
      (!normalizedRoleName && user?.role === "owner")
  );
};
