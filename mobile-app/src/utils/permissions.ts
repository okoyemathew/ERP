import type { Role } from "@/types/domain.types";

const ownerOnly = new Set([
  "OwnerDashboard",
  "Inventory",
  "Employees",
  "EmployeeDetail",
  "CreditSales",
  "PendingPayments",
  "Reports",
  "CashRegister",
  "Disbursed"
]);

const employeeOnly = new Set(["EmployeeDashboard"]);

export const canAccess = (role: Role, feature: string): boolean => {
  if (role === "owner") return !employeeOnly.has(feature);
  if (employeeOnly.has(feature)) return true;
  return !ownerOnly.has(feature);
};
