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

const Stack = createNativeStackNavigator<AppStackParamList>();

export function AppNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Tabs" component={BottomTabNavigator} />
      <Stack.Screen name="CustomerDetail" component={CustomerDetailScreen} />
      <Stack.Screen name="CustomerForm" component={CustomerFormScreen} />
      <Stack.Screen name="CreditSales" component={CreditSalesScreen} />
      <Stack.Screen name="Employees" component={EmployeesScreen} />
      <Stack.Screen name="EmployeeDetail" component={EmployeeDetailScreen} />
      <Stack.Screen name="EmployeeForm" component={EmployeeFormScreen} />
      <Stack.Screen name="Inventory" component={InventoryScreen} />
      <Stack.Screen name="ProductDetail" component={ProductDetailScreen} />
      <Stack.Screen name="ProductForm" component={ProductFormScreen} />
      <Stack.Screen name="ProductOptionManager" component={ProductOptionManagerScreen} />
      <Stack.Screen name="Expenses" component={ExpensesScreen} />
      <Stack.Screen name="Supplied" component={SuppliedScreen} />
      <Stack.Screen name="SupplierDetail" component={SupplierDetailScreen} />
      <Stack.Screen name="SupplierForm" component={SupplierFormScreen} />
      <Stack.Screen name="Disbursed" component={DisbursedScreen} />
      <Stack.Screen name="PendingPayments" component={PendingPaymentsScreen} />
      <Stack.Screen name="Reports" component={ReportsScreen} />
      <Stack.Screen name="CashRegister" component={CashRegisterScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="BusinessProfile" component={BusinessProfileScreen} />
      <Stack.Screen name="ReceiptSettings" component={ReceiptSettingsScreen} />
      <Stack.Screen name="TaxSettings" component={TaxSettingsScreen} />
      <Stack.Screen name="LanguageSettings" component={LanguageSettingsScreen} />
      <Stack.Screen name="PrinterSettings" component={PrinterSettingsScreen} />
      <Stack.Screen name="ThemeSettings" component={ThemeSettingsScreen} />
      <Stack.Screen name="HelpSupport" component={HelpSupportScreen} />
      <Stack.Screen name="AboutBusiness" component={AboutBusinessScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
      <Stack.Screen name="Notifications" component={NotificationsScreen} />
      <Stack.Screen name="Profile" component={ProfileScreen} />
    </Stack.Navigator>
  );
}
