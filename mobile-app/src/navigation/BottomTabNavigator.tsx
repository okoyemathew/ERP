import React, { useState } from "react";
import { View } from "react-native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import type { BottomTabParamList } from "@/types/navigation.types";
import { BottomNav, DrawerMenu } from "@/components/common";
import { OwnerDashboard } from "@/screens/dashboard/OwnerDashboard";
import { SalesRecordsScreen } from "@/screens/sales/SalesRecordsScreen";
import { AddNewSalesScreen } from "@/screens/sales/AddNewSalesScreen";
import { CustomersScreen } from "@/screens/customers/CustomersScreen";
import { useAuthStore } from "@/store/authStore";

const Tabs = createBottomTabNavigator<BottomTabParamList>();

function EmptyMore() {
  return <View />;
}

export function BottomTabNavigator() {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const role = useAuthStore((state) => state.user?.role ?? "owner");
  const logout = useAuthStore((state) => state.logout);
  const Dashboard = OwnerDashboard;

  return (
    <Tabs.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <>
          <BottomNav
            active={state.routeNames[state.index] as keyof BottomTabParamList}
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
              navigation.getParent()?.navigate(route as never);
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
