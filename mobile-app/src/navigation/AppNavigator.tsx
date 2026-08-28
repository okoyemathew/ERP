import React from "react";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import type { AppStackParamList } from "@/types/navigation.types";
import { BottomTabNavigator } from "./BottomTabNavigator";
import { CashRegisterScreen } from "@/screens/cashregister/CashRegisterScreen";
import { CustomerDetailScreen } from "@/screens/customers/CustomerDetailScreen";
import { CustomerFormScreen } from "@/screens/customers/CustomerFormScreen";
import { EmployeesScreen } from "@/screens/employees/EmployeesScreen";
import { EmployeeDetailScreen } from "@/screens/employees/EmployeeDetailScreen";
import { DisbursedScreen } from "@/screens/finance/DisbursedScreen";
import { ExpensesScreen } from "@/screens/finance/ExpensesScreen";
import { PendingPaymentsScreen } from "@/screens/finance/PendingPaymentsScreen";
import { SupplierDetailScreen } from "@/screens/finance/SupplierDetailScreen";
import { SupplierFormScreen } from "@/screens/finance/SupplierFormScreen";
import { SuppliedScreen } from "@/screens/finance/SuppliedScreen";
import { InventoryScreen } from "@/screens/inventory/InventoryScreen";
import { ProductDetailScreen } from "@/screens/inventory/ProductDetailScreen";
import { ProductFormScreen } from "@/screens/inventory/ProductFormScreen";
import { ProductOptionManagerScreen } from "@/screens/inventory/ProductOptionManagerScreen";
import { ReportsScreen } from "@/screens/reports/ReportsScreen";
import { CreditSalesScreen } from "@/screens/sales/CreditSalesScreen";
import { NotificationsScreen } from "@/screens/settings/NotificationsScreen";
import { ProfileScreen } from "@/screens/settings/ProfileScreen";
import { SettingsScreen } from "@/screens/settings/SettingsScreen";
import { BusinessProfileScreen } from "@/screens/settings/BusinessProfileScreen";
import { AboutBusinessScreen } from "@/screens/settings/AboutBusinessScreen";
import { HelpSupportScreen } from "@/screens/settings/HelpSupportScreen";
import { NotificationSettingsScreen } from "@/screens/settings/NotificationSettingsScreen";
import { PrinterSettingsScreen } from "@/screens/settings/PrinterSettingsScreen";
import { ReceiptSettingsScreen } from "@/screens/settings/ReceiptSettingsScreen";
import { TaxSettingsScreen } from "@/screens/settings/TaxSettingsScreen";
import { LanguageSettingsScreen } from "@/screens/settings/LanguageSettingsScreen";
import { ThemeSettingsScreen } from "@/screens/settings/ThemeSettingsScreen";
import { EmployeeFormScreen } from "@/screens/employees/EmployeeFormScreen";
import { useAuthStore } from "@/store/authStore";
import { canAccess } from "@/utils/permissions";

const Stack = createNativeStackNavigator<AppStackParamList>();

const appScreens: Array<{
  name: keyof AppStackParamList;
  component: React.ComponentType<any>;
}> = [
  { name: "CustomerDetail", component: CustomerDetailScreen },
  { name: "CustomerForm", component: CustomerFormScreen },
  { name: "CreditSales", component: CreditSalesScreen },
  { name: "Employees", component: EmployeesScreen },
  { name: "EmployeeDetail", component: EmployeeDetailScreen },
  { name: "EmployeeForm", component: EmployeeFormScreen },
  { name: "Inventory", component: InventoryScreen },
  { name: "ProductDetail", component: ProductDetailScreen },
  { name: "ProductForm", component: ProductFormScreen },
  { name: "ProductOptionManager", component: ProductOptionManagerScreen },
  { name: "Expenses", component: ExpensesScreen },
  { name: "Supplied", component: SuppliedScreen },
  { name: "SupplierDetail", component: SupplierDetailScreen },
  { name: "SupplierForm", component: SupplierFormScreen },
  { name: "Disbursed", component: DisbursedScreen },
  { name: "PendingPayments", component: PendingPaymentsScreen },
  { name: "Reports", component: ReportsScreen },
  { name: "CashRegister", component: CashRegisterScreen },
  { name: "Settings", component: SettingsScreen },
  { name: "BusinessProfile", component: BusinessProfileScreen },
  { name: "ReceiptSettings", component: ReceiptSettingsScreen },
  { name: "TaxSettings", component: TaxSettingsScreen },
  { name: "LanguageSettings", component: LanguageSettingsScreen },
  { name: "PrinterSettings", component: PrinterSettingsScreen },
  { name: "ThemeSettings", component: ThemeSettingsScreen },
  { name: "HelpSupport", component: HelpSupportScreen },
  { name: "AboutBusiness", component: AboutBusinessScreen },
  { name: "NotificationSettings", component: NotificationSettingsScreen },
  { name: "Notifications", component: NotificationsScreen },
  { name: "Profile", component: ProfileScreen }
];

export function AppNavigator() {
  const role = useAuthStore((state) => state.user?.role ?? "owner");
  const screens = appScreens.filter((screen) => canAccess(role, screen.name));

  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={BottomTabNavigator} />
      {screens.map((screen) => (
        <Stack.Screen key={screen.name} name={screen.name} component={screen.component} />
      ))}
    </Stack.Navigator>
  );
}
