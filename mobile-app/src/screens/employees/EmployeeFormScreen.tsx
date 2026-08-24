import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { Text } from "@/i18n";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle, SimpleRow } from "@/screens/shared/ScreenKit";
import { businessService } from "@/services/business.service";
import { employeesService } from "@/services/employees.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";
import type { ApiRole, UpsertEmployeePayload } from "@/types/employee";

type FormState = UpsertEmployeePayload & {
  confirmPassword?: string;
};

const defaults: FormState = {
  employeeCode: "",
  firstName: "",
  lastName: "",
  username: "",
  password: "",
  confirmPassword: "",
  roleId: undefined,
  phone: "",
  email: "",
  department: "",
  designation: "",
  profileImage: "",
  canLogin: true,
  canSell: true,
  canManageStock: false,
  canManageExpenses: false,
  canPrintReceipt: true
};

export function EmployeeFormScreen({ route, navigation }: { route: any; navigation: any }) {
  const employeeId = route.params?.employeeId as string | undefined;
  const businessId = useAuthStore((state) => state.business?.id ?? state.user?.businessId);
  const canManage = useAuthStore((state) => state.can("employees.manage"));
  const [form, setForm] = useState<FormState>(defaults);
  const [roles, setRoles] = useState<ApiRole[]>([]);
  const [loading, setLoading] = useState(Boolean(employeeId));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const title = employeeId ? "Edit Employee" : "Create Employee";
  const selectedRole = useMemo(() => roles.find((role) => role.id === form.roleId), [form.roleId, roles]);

  const load = useCallback(async () => {
    if (!businessId) return;
    setLoading(true);
    setError(false);
    try {
      const roleList = await businessService.roles(businessId);
      setRoles(roleList);
      if (employeeId) {
        const employee = await employeesService.detail(employeeId);
        setForm({
          ...defaults,
          employeeCode: employee.employeeCode,
          firstName: employee.firstName,
          lastName: employee.lastName,
          username: employee.user.username,
          password: "",
          confirmPassword: "",
          roleId: employee.user.role?.id,
          phone: employee.phone ?? "",
          email: employee.email ?? "",
          department: employee.department ?? "",
          designation: employee.designation ?? "",
          profileImage: employee.profileImage ?? "",
          status: employee.status,
          canLogin: employee.canLogin,
          canSell: employee.canSell,
          canManageStock: employee.canManageStock,
          canManageExpenses: employee.canManageExpenses,
          canPrintReceipt: employee.canPrintReceipt
        });
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [businessId, employeeId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (field: keyof FormState, value: string | boolean | undefined) => {
    setForm((current) => ({ ...current, [field]: value }));
  };

  const save = async () => {
    if (saving || !canManage) return;
    if (!form.employeeCode || !form.firstName || !form.lastName || !form.username) {
      Alert.alert("Missing details", "Employee code, name, and username are required.");
      return;
    }
    if (!employeeId && (!form.password || form.password.length < 8 || !/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d])/.test(form.password))) {
      Alert.alert("Password required", "Initial password must include uppercase, lowercase, number, and special character.");
      return;
    }
    if (form.password && form.password !== form.confirmPassword) {
      Alert.alert("Password mismatch", "Password and confirmation must match.");
      return;
    }

    setSaving(true);
    try {
      const payload: UpsertEmployeePayload = {
        employeeCode: form.employeeCode,
        firstName: form.firstName,
        lastName: form.lastName,
        username: form.username,
        roleId: form.roleId,
        phone: form.phone || undefined,
        email: form.email || undefined,
        department: form.department || undefined,
        designation: form.designation || undefined,
        profileImage: form.profileImage || undefined,
        canLogin: form.canLogin,
        canSell: form.canSell,
        canManageStock: form.canManageStock,
        canManageExpenses: form.canManageExpenses,
        canPrintReceipt: form.canPrintReceipt
      };
      if (form.password) payload.password = form.password;

      if (employeeId) {
        await employeesService.update(employeeId, payload);
      } else {
        await employeesService.create(payload);
      }
      navigation.goBack();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save employee.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading employee form" />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ScrollScreen title={title} onBack={() => navigation.goBack()}>
      <SectionTitle title="Employee Information" />
      <Card style={styles.form}>
        <Input label="Employee Code" value={form.employeeCode} onChangeText={(value) => setField("employeeCode", value)} editable={canManage} />
        <Input label="First Name" value={form.firstName} onChangeText={(value) => setField("firstName", value)} editable={canManage} />
        <Input label="Last Name" value={form.lastName} onChangeText={(value) => setField("lastName", value)} editable={canManage} />
        <Input label="Phone" value={form.phone ?? ""} onChangeText={(value) => setField("phone", value)} keyboardType="phone-pad" editable={canManage} />
        <Input label="Email" value={form.email ?? ""} onChangeText={(value) => setField("email", value)} keyboardType="email-address" autoCapitalize="none" editable={canManage} />
        <Input label="Department" value={form.department ?? ""} onChangeText={(value) => setField("department", value)} editable={canManage} />
        <Input label="Designation" value={form.designation ?? ""} onChangeText={(value) => setField("designation", value)} editable={canManage} />
        <Input label="Profile Image URL" value={form.profileImage ?? ""} onChangeText={(value) => setField("profileImage", value)} autoCapitalize="none" editable={canManage} />
      </Card>

      <SectionTitle title="Login" />
      <Card style={styles.form}>
        <Input label="Username" value={form.username} onChangeText={(value) => setField("username", value)} autoCapitalize="none" editable={canManage} />
        <Input label={employeeId ? "New Password" : "Initial Password"} value={form.password ?? ""} onChangeText={(value) => setField("password", value)} secureTextEntry editable={canManage} />
        <Input label="Confirm Password" value={form.confirmPassword ?? ""} onChangeText={(value) => setField("confirmPassword", value)} secureTextEntry editable={canManage} />
      </Card>

      <SectionTitle title="Role" />
      <Card style={styles.form}>
        <Text style={styles.selectedRole}>{selectedRole ? selectedRole.name : "No role selected"}</Text>
        {roles.map((role) => (
          <SimpleRow
            key={role.id}
            title={role.name}
            subtitle={role.description ?? undefined}
            status={role.id === form.roleId ? "Selected" : undefined}
            onPress={canManage ? () => setField("roleId", role.id) : undefined}
          />
        ))}
      </Card>

      {!canManage ? <Text style={styles.note}>You do not have permission to manage employees.</Text> : null}
      <Button label="Save Employee" loading={saving} onPress={save} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  selectedRole: { ...typography.subtitle, color: colors.textSecondary, fontWeight: "800" },
  note: { ...typography.caption, color: colors.textMuted }
});
