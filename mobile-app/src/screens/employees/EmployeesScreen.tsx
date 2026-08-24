import React, { useCallback, useEffect, useState } from "react";
import { Pressable, StyleSheet } from "react-native";
import { Plus, Users } from "lucide-react-native";
import { Avatar } from "@/components/common";
import { ErrorState, LoadingState } from "@/components/common";
import { SimpleRow, ListScreen } from "@/screens/shared/ScreenKit";
import { employeesService } from "@/services/employees.service";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme";
import type { ApiEmployee } from "@/types/employee";

function employeeName(employee: ApiEmployee) {
  return `${employee.firstName} ${employee.lastName}`.trim() || employee.user.username;
}

export function EmployeesScreen({ navigation }: { navigation: any }) {
  const canManage = useAuthStore((state) => state.can("employees.manage"));
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await employeesService.list({ limit: 100 });
      setEmployees(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      void load();
    });
    void load();
    return unsubscribe;
  }, [load, navigation]);

  if (loading) return <LoadingState label="Loading employees" />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ListScreen
      title="Employees"
      right={
        canManage ? (
          <Pressable style={styles.addButton} onPress={() => navigation.navigate("EmployeeForm")} accessibilityRole="button" accessibilityLabel="Add employee">
            <Plus size={20} color={colors.surface} />
          </Pressable>
        ) : undefined
      }
      data={employees}
      keyExtractor={(item) => item.id}
      renderItem={({ item }) => (
        <SimpleRow
          title={employeeName(item)}
          subtitle={`${item.user.role?.name ?? "No role"} | ${item.status}`}
          amount={item.canLogin ? "Login" : "No login"}
          status={item.status}
          icon={<Avatar name={employeeName(item)} imageUri={item.profileImage ?? undefined} size={40} />}
          onPress={() => navigation.navigate("EmployeeDetail", { employeeId: item.id })}
        />
      )}
      empty={<SimpleRow title="No employees added yet" icon={<Users size={18} color={colors.primary} />} />}
    />
  );
}

const styles = StyleSheet.create({
  addButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.primary
  }
});
