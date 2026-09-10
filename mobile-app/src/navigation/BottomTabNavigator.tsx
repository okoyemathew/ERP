import React from "react";
import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabParamList } from "@/types/navigation.types";
import { BottomNav } from "@/components/common";
import { OwnerDashboard } from "@/screens/dashboard/OwnerDashboard";
import { EmployeeDashboard } from "@/screens/dashboard/EmployeeDashboard";
import { SalesRecordsScreen } from "@/screens/sales/SalesRecordsScreen";
import { AddNewSalesScreen } from "@/screens/sales/AddNewSalesScreen";
import { CustomersScreen } from "@/screens/customers/CustomersScreen";
import { useAuthStore } from "@/store/authStore";
import { appRoleForUser } from "@/utils/permissions";
import { useAppNavigationMenu } from "./AppNavigationMenu";

const Tabs = createBottomTabNavigator<BottomTabParamList>();

function EmptyMore() {
  return <View />;
}

export function BottomTabNavigator() {
  const user = useAuthStore((state) => state.user);
  const navigationMenu = useAppNavigationMenu();
  const role = appRoleForUser(user);
  const Dashboard = role === "owner" ? OwnerDashboard : EmployeeDashboard;

  return (
    <Tabs.Navigator
      initialRouteName="Dashboard"
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <>
          <BottomNav
            active={state.routeNames[state.index] as keyof BottomTabParamList}
            onTabPress={(tab) => {
              if (tab === "More") {
                navigationMenu?.openMenu();
                return;
              }
              navigation.navigate(tab);
            }}
          />
        </>
      )}
    >
      <Tabs.Screen name="Dashboard" component={Dashboard} />
      <Tabs.Screen name="SalesRecords" component={SalesRecordsScreen} />
      <Tabs.Screen name="AddNewSales" component={AddNewSalesScreen} />
      <Tabs.Screen name="Customers" component={CustomersScreen} />
      <Tabs.Screen name="More" component={EmptyMore} />
    </Tabs.Navigator>
  );
}
