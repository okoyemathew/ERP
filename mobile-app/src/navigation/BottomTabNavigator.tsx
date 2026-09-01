import React, { useState } from "react";
import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabParamList } from "@/types/navigation.types";
import { BottomNav, DrawerMenu, employeeBottomTabs, ownerBottomTabs } from "@/components/common";
import { OwnerDashboard } from "@/screens/dashboard/OwnerDashboard";
import { EmployeeDashboard } from "@/screens/dashboard/EmployeeDashboard";
import { SalesRecordsScreen } from "@/screens/sales/SalesRecordsScreen";
import { AddNewSalesScreen } from "@/screens/sales/AddNewSalesScreen";
import { CustomersScreen } from "@/screens/customers/CustomersScreen";
import { CreditSalesScreen } from "@/screens/sales/CreditSalesScreen";
import { ExpensesScreen } from "@/screens/finance/ExpensesScreen";
import { SuppliedScreen } from "@/screens/finance/SuppliedScreen";
import { NotificationsScreen } from "@/screens/settings/NotificationsScreen";
import { ProfileScreen } from "@/screens/settings/ProfileScreen";
import { SettingsScreen } from "@/screens/settings/SettingsScreen";
import { useAuthStore } from "@/store/authStore";

const Tabs = createBottomTabNavigator<BottomTabParamList>();

function EmptyMore() {
  return <View />;
}

export function BottomTabNavigator() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const role = user?.roleName ? (user.roleName === "Owner" ? "owner" : "employee") : user?.role ?? "owner";
  const logout = useAuthStore((state) => state.logout);
  const Dashboard = role === "owner" ? OwnerDashboard : EmployeeDashboard;
  const tabs = role === "owner" ? ownerBottomTabs : employeeBottomTabs;

  return (
    <Tabs.Navigator
      initialRouteName={role === "owner" ? "Dashboard" : "CreditSales"}
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <>
          <BottomNav
            active={state.routeNames[state.index] as keyof BottomTabParamList}
            tabs={tabs}
            fabIndex={role === "owner" ? 2 : null}
            onTabPress={(tab) => {
              if (tab === "More") {
                setDrawerOpen(true);
                return;
              }
              navigation.navigate(tab);
            }}
          />
          <DrawerMenu
            open={drawerOpen}
            role={role}
            onClose={() => setDrawerOpen(false)}
            onLogout={() => {
              setDrawerOpen(false);
              void logout();
            }}
            onNavigate={(route) => {
              setDrawerOpen(false);
              if (state.routeNames.includes(route)) {
                navigation.navigate(route as never);
                return;
              }
              const parent = navigation.getParent();
              if (parent) parent.navigate(route as never);
              else navigation.navigate(route as never);
            }}
          />
        </>
      )}
    >
      {role === "owner" ? (
        <>
          <Tabs.Screen name="Dashboard" component={Dashboard} />
          <Tabs.Screen name="SalesRecords" component={SalesRecordsScreen} />
          <Tabs.Screen name="AddNewSales" component={AddNewSalesScreen} />
          <Tabs.Screen name="Customers" component={CustomersScreen} />
          <Tabs.Screen name="More" component={EmptyMore} />
        </>
      ) : (
        <>
          <Tabs.Screen name="CreditSales" component={CreditSalesScreen} />
          <Tabs.Screen name="Expenses" component={ExpensesScreen} />
          <Tabs.Screen name="Supplied" component={SuppliedScreen} />
          <Tabs.Screen name="Notifications" component={NotificationsScreen} />
          <Tabs.Screen name="Profile" component={ProfileScreen} />
          <Tabs.Screen name="Settings" component={SettingsScreen} />
        </>
      )}
    </Tabs.Navigator>
  );
}
