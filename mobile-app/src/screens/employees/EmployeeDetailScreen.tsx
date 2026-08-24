import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { LinearGradient } from "expo-linear-gradient";
import { Avatar, Button, Card, ErrorState, LoadingState, ScreenHeader } from "@/components/common";
import { employeesService } from "@/services/employees.service";
import { useAuthStore } from "@/store/authStore";
import { colors } from "@/theme";
import type { ApiEmployee, EmployeeProfileResponse } from "@/types/employee";

export function EmployeeDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const employeeId = route.params?.employeeId as string;
  const canManage = useAuthStore((state) => state.can("employees.manage"));
  const canManageRoles = useAuthStore((state) => state.can("roles.manage"));
  const [profile, setProfile] = useState<EmployeeProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const response = await employeesService.profile(employeeId);
      setProfile(response);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateStatus = async (action: "activate" | "deactivate" | "suspend") => {
    if (!profile) return;
    try {
      if (action === "activate") await employeesService.activate(profile.employee.id);
      if (action === "deactivate") await employeesService.deactivate(profile.employee.id);
      if (action === "suspend") await employeesService.suspend(profile.employee.id);
      await load();
    } catch (statusError) {
      const message = statusError instanceof Error ? statusError.message : "Unable to update employee status.";
      Alert.alert("Unable to update", message);
    }
  };

  const toggleLogin = async (employee: ApiEmployee) => {
    try {
      await employeesService.setLoginAccess(employee.id, !employee.canLogin);
      await load();
    } catch (loginError) {
      const message = loginError instanceof Error ? loginError.message : "Unable to update login access.";
      Alert.alert("Unable to update", message);
    }
  };

  if (loading) return <LoadingState label="Loading employee" />;
  if (error || !profile) return <ErrorState onRetry={load} />;

  const employee = profile.employee;
  const name = `${employee.firstName} ${employee.lastName}`.trim() || employee.user.username;
  const latestSession = profile.recentSessions[0];

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Employee Detail" onBack={() => navigation.goBack()} />
      <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.hero}>
        <Avatar name={name} imageUri={employee.profileImage ?? undefined} size={64} />
        <Text style={styles.name}>{name}</Text>
        <Text style={styles.role}>{employee.user.role?.name ?? "No role"} | {employee.status}</Text>
      </LinearGradient>
      <View style={styles.grid}>
        <Card style={styles.stat}><Text style={styles.value}>{profile.summary.salesCount}</Text><Text style={styles.label}>Sales</Text></Card>
        <Card style={styles.stat}><Text style={styles.value}>{profile.summary.activeSessions}</Text><Text style={styles.label}>Active sessions</Text></Card>
      </View>
      <View style={styles.content}>
        <Card style={styles.infoCard}>
          <Info label="Employee Code" value={employee.employeeCode} />
          <Info label="Department" value={employee.department ?? "Not set"} />
          <Info label="Designation" value={employee.designation ?? "Not set"} />
          <Info label="Phone" value={employee.phone ?? "Not set"} />
          <Info label="Email" value={employee.email ?? "Not set"} />
          <Info label="Last Login" value={employee.lastLogin ?? employee.user.lastLogin ?? "No login recorded"} />
          <Info label="Device" value={latestSession?.deviceName ?? latestSession?.deviceType ?? employee.deviceId ?? "No device recorded"} />
          <Info label="Login Access" value={employee.canLogin ? "Enabled" : "Disabled"} />
        </Card>

        {canManage ? (
          <View style={styles.actions}>
            <Button label="Edit Employee" onPress={() => navigation.navigate("EmployeeForm", { employeeId: employee.id })} />
            <Button label={employee.canLogin ? "Disable Login" : "Enable Login"} variant="ghost" onPress={() => void toggleLogin(employee)} />
            <Button label={employee.status === "ACTIVE" ? "Deactivate" : "Activate"} variant={employee.status === "ACTIVE" ? "danger" : "success"} onPress={() => void updateStatus(employee.status === "ACTIVE" ? "deactivate" : "activate")} />
            {canManageRoles ? <Button label="Suspend" variant="ghost" onPress={() => void updateStatus("suspend")} /> : null}
          </View>
        ) : null}
      </View>
    </View>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.item}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  hero: { padding: 20, alignItems: "center", gap: 6 },
  name: { color: colors.surface, fontSize: 20, fontWeight: "800" },
  role: { color: "rgba(255,255,255,0.72)", fontSize: 12 },
  grid: { flexDirection: "row", gap: 12, padding: 16 },
  stat: { flex: 1, alignItems: "center" },
  value: { color: colors.foreground, fontSize: 17, fontWeight: "800" },
  label: { color: colors.textPlaceholder, fontSize: 11, marginTop: 4 },
  content: { paddingHorizontal: 16, gap: 10 },
  infoCard: { gap: 12 },
  infoRow: { gap: 3 },
  item: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  actions: { gap: 10, paddingBottom: 24 }
});
