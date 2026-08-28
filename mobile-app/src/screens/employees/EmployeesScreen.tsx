import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { ChevronLeft, Edit3, Lock, Plus, Trash2, Unlock, Users } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Avatar, Badge, Button, EmptyState, ErrorState, LoadingState, statusVariant } from "@/components/common";
import { employeesService } from "@/services/employees.service";
import { useAuthStore } from "@/store/authStore";
import { colors, shadows, spacing, typography } from "@/theme";
import type { ApiEmployee } from "@/types/employee";

type SalesTodayMap = Record<string, number | null | undefined>;

function employeeName(employee: ApiEmployee) {
  return `${employee.firstName} ${employee.lastName}`.trim() || employee.user.username;
}

function employeeSubtitle(employee: ApiEmployee) {
  return employee.designation || employee.user.role?.name || employee.department || "No role";
}

function isEmployeeActive(employee: ApiEmployee) {
  return employee.status === "ACTIVE" && employee.canLogin && employee.user.status === "ACTIVE";
}

function employeeStatusLabel(employee: ApiEmployee) {
  if (!employee.canLogin) return "disabled";
  return employee.status.toLowerCase();
}

function employeeStatusVariant(employee: ApiEmployee) {
  if (isEmployeeActive(employee)) return "success";
  if (employee.status === "SUSPENDED") return "warning";
  if (employee.status === "TERMINATED") return "error";
  return statusVariant(employee.status);
}

function todayRange() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);

  const end = new Date(start);
  end.setDate(end.getDate() + 1);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
}

function compactLastActive(value: string | null | undefined) {
  if (!value) return "Never";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";

  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;

  if (diffMs < minute) return "Just now";
  if (diffMs < hour) return `${Math.floor(diffMs / minute)}m ago`;
  if (diffMs < day) return `${Math.floor(diffMs / hour)}h ago`;
  if (diffMs < day * 7) return `${Math.floor(diffMs / day)}d ago`;

  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function EmployeesScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const canManage = useAuthStore((state) => state.can("employees.manage"));
  const currentUser = useAuthStore((state) => state.user);
  const [employees, setEmployees] = useState<ApiEmployee[]>([]);
  const [salesToday, setSalesToday] = useState<SalesTodayMap>({});
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [processingEmployeeId, setProcessingEmployeeId] = useState<string | null>(null);

  const isOwnerUser = currentUser?.roleName === "Owner";

  const loadSalesToday = useCallback(async (items: ApiEmployee[]) => {
    const range = todayRange();
    const entries = await Promise.all(
      items.map(async (employee) => {
        try {
          const response = await employeesService.sales(employee.id, {
            page: 1,
            limit: 1,
            startDate: range.startDate,
            endDate: range.endDate
          });
          return [employee.id, response.meta.total] as const;
        } catch {
          return [employee.id, null] as const;
        }
      })
    );

    setSalesToday(Object.fromEntries(entries));
  }, []);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(false);
    try {
      const response = await employeesService.list({ limit: 100 });
      setEmployees(response.data);
      setSalesToday({});
      void loadSalesToday(response.data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [loadSalesToday]);

  useEffect(() => {
    const unsubscribe = navigation.addListener("focus", () => {
      void load();
    });
    void load();
    return unsubscribe;
  }, [load, navigation]);

  const counts = useMemo(() => {
    const active = employees.filter(isEmployeeActive).length;
    return {
      total: employees.length,
      active,
      inactive: employees.length - active
    };
  }, [employees]);

  const canUseOwnerActions = (employee: ApiEmployee) =>
    canManage &&
    isOwnerUser &&
    employee.user.role?.name !== "Owner" &&
    employee.userId !== currentUser?.id &&
    employee.id !== currentUser?.employeeId;

  const canShowDeleteAction = canManage && isOwnerUser;

  const explainDeleteUnavailable = (employee: ApiEmployee) => {
    if (employee.userId === currentUser?.id || employee.id === currentUser?.employeeId) {
      Alert.alert("Cannot remove account", "You cannot delete your own employee profile while you are signed in.");
      return;
    }

    if (employee.user.role?.name === "Owner") {
      Alert.alert("Cannot remove owner", "Business owner profiles cannot be removed from the Employees screen.");
      return;
    }

    Alert.alert("Cannot remove employee", "You do not have permission to delete this employee.");
  };

  const updateEmployeeInList = (updated: ApiEmployee) => {
    setEmployees((current) => current.map((employee) => (employee.id === updated.id ? updated : employee)));
  };

  const toggleLogin = (employee: ApiEmployee) => {
    if (processingEmployeeId) return;

    const nextCanLogin = !employee.canLogin;
    const name = employeeName(employee);
    const run = async () => {
      setProcessingEmployeeId(employee.id);
      try {
        const updated = await employeesService.setLoginAccess(employee.id, nextCanLogin);
        updateEmployeeInList(updated);
        Alert.alert(nextCanLogin ? "Login enabled" : "Login disabled", `${name}'s login access has been ${nextCanLogin ? "enabled" : "disabled"}.`);
      } catch (actionError) {
        const message = actionError instanceof Error ? actionError.message : "Unable to update login access.";
        Alert.alert("Unable to update", message);
      } finally {
        setProcessingEmployeeId(null);
      }
    };

    if (nextCanLogin) {
      void run();
      return;
    }

    Alert.alert(
      "Disable Login?",
      `Are you sure you want to disable login for ${name}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Disable", style: "destructive", onPress: () => void run() }
      ]
    );
  };

  const deleteEmployee = (employee: ApiEmployee) => {
    if (processingEmployeeId) return;

    const name = employeeName(employee);
    Alert.alert(
      "Delete Employee?",
      `Are you sure you want to delete this employee?\nThis action cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            setProcessingEmployeeId(employee.id);
            try {
              await employeesService.remove(employee.id);
              setEmployees((current) => current.filter((item) => item.id !== employee.id));
              setSalesToday((current) => {
                const next = { ...current };
                delete next[employee.id];
                return next;
              });
              void load(false);
              Alert.alert("Employee deleted", `${name} has been removed from the employee list.`);
            } catch (deleteError) {
              const message = deleteError instanceof Error ? deleteError.message : "Unable to delete employee.";
              Alert.alert("Unable to delete", message);
            } finally {
              setProcessingEmployeeId(null);
            }
          }
        }
      ]
    );
  };

  const refresh = () => {
    setRefreshing(true);
    void load(false);
  };

  if (loading) return <LoadingState label="Loading employees" />;
  if (error) return <ErrorState onRetry={() => void load()} />;

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, spacing.statusBarTop) }]}>
        <Pressable
          onPress={() => (navigation.canGoBack() ? navigation.goBack() : navigation.navigate("Tabs"))}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <ChevronLeft size={22} color={colors.textPlaceholder} />
        </Pressable>
        <Text style={styles.title}>Employees</Text>
        {canManage ? (
          <Pressable style={styles.addButton} onPress={() => navigation.navigate("EmployeeForm")} accessibilityRole="button" accessibilityLabel="Add employee">
            <Plus size={16} color={colors.surface} />
            <Text style={styles.addText}>Add</Text>
          </Pressable>
        ) : (
          <View style={styles.headerSpacer} />
        )}
      </View>

      <FlatList
        data={employees}
        keyExtractor={(item) => item.id}
        refreshing={refreshing}
        onRefresh={refresh}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.listContent, { paddingBottom: spacing.bottomNavHeight + Math.max(insets.bottom, 16) + 28 }]}
        ListHeaderComponent={
          <View style={styles.summaryRow}>
            <SummaryCard label="Total" value={counts.total} />
            <SummaryCard label="Active" value={counts.active} />
            <SummaryCard label="Inactive" value={counts.inactive} />
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <EmptyState icon={<Users size={24} color={colors.primary} />} title="No employees added yet" />
            {canManage ? <Button label="Add Employee" onPress={() => navigation.navigate("EmployeeForm")} style={styles.emptyButton} /> : null}
          </View>
        }
        renderItem={({ item }) => (
          <EmployeeCard
            employee={item}
            salesToday={salesToday[item.id]}
            processing={processingEmployeeId === item.id}
            canEdit={canManage}
            canManageAccess={canUseOwnerActions(item)}
            showDeleteAction={canShowDeleteAction}
            canDelete={canUseOwnerActions(item)}
            onOpen={() => navigation.navigate("EmployeeDetail", { employeeId: item.id })}
            onEdit={() => navigation.navigate("EmployeeForm", { employeeId: item.id })}
            onToggleLogin={() => toggleLogin(item)}
            onDelete={() => (canUseOwnerActions(item) ? deleteEmployee(item) : explainDeleteUnavailable(item))}
          />
        )}
      />
    </View>
  );
}

function SummaryCard({ label, value }: { label: string; value: number }) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryLabel}>{label}</Text>
    </View>
  );
}

function EmployeeCard({
  employee,
  salesToday,
  processing,
  canEdit,
  canManageAccess,
  showDeleteAction,
  canDelete,
  onOpen,
  onEdit,
  onToggleLogin,
  onDelete
}: {
  employee: ApiEmployee;
  salesToday: number | null | undefined;
  processing: boolean;
  canEdit: boolean;
  canManageAccess: boolean;
  showDeleteAction: boolean;
  canDelete: boolean;
  onOpen: () => void;
  onEdit: () => void;
  onToggleLogin: () => void;
  onDelete: () => void;
}) {
  const name = employeeName(employee);
  const lastActive = compactLastActive(employee.lastLogin ?? employee.user.lastLogin);

  return (
    <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${name}`}>
      <View style={[styles.employeeCard, processing && styles.processingCard]}>
        <View style={styles.employeeTop}>
          <Avatar name={name} imageUri={employee.profileImage ?? undefined} size={48} />
          <View style={styles.employeeIdentity}>
            <Text style={styles.employeeName} numberOfLines={1}>{name}</Text>
            <Text style={styles.employeeRole} numberOfLines={1}>{employeeSubtitle(employee)}</Text>
          </View>
          <Badge label={employeeStatusLabel(employee)} variant={employeeStatusVariant(employee)} />
        </View>

        <View style={styles.employeeBottom}>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Sales Today</Text>
            <Text style={styles.metricValue}>{salesToday === undefined ? "..." : salesToday === null ? "--" : salesToday}</Text>
          </View>
          <View style={styles.metricBlock}>
            <Text style={styles.metricLabel}>Last Active</Text>
            <Text style={styles.metricValue}>{lastActive}</Text>
          </View>
          <View style={styles.actionRow}>
            {canEdit ? (
              <IconAction icon={<Edit3 size={16} color={colors.primary} />} label={`Edit ${name}`} disabled={processing} onPress={onEdit} />
            ) : null}
            {showDeleteAction ? (
              <IconAction
                icon={<Trash2 size={16} color={colors.error} />}
                label={canDelete ? `Delete ${name}` : `Delete unavailable for ${name}`}
                destructive
                disabled={processing}
                onPress={onDelete}
              />
            ) : null}
            {canManageAccess ? (
              <IconAction
                icon={employee.canLogin ? <Lock size={16} color={colors.warning} /> : <Unlock size={16} color={colors.successDark} />}
                label={employee.canLogin ? `Disable login for ${name}` : `Enable login for ${name}`}
                disabled={processing}
                onPress={onToggleLogin}
              />
            ) : null}
          </View>
        </View>
      </View>
    </Pressable>
  );
}

function IconAction({
  icon,
  label,
  disabled,
  destructive,
  onPress
}: {
  icon: React.ReactNode;
  label: string;
  disabled?: boolean;
  destructive?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={(event) => {
        event.stopPropagation();
        onPress();
      }}
      disabled={disabled}
      style={[styles.iconAction, destructive && styles.destructiveAction, disabled && styles.disabledAction]}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={6}
    >
      {icon}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  header: {
    minHeight: 110,
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: 12,
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLighter,
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 10
  },
  backButton: {
    width: 44,
    height: 44,
    marginLeft: -12,
    alignItems: "center",
    justifyContent: "center"
  },
  title: {
    ...typography.screenTitle,
    flex: 1,
    color: colors.foreground
  },
  addButton: {
    minHeight: 36,
    paddingHorizontal: 14,
    borderRadius: 18,
    backgroundColor: colors.primary,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6
  },
  addText: {
    color: colors.surface,
    fontSize: 13,
    fontWeight: "800"
  },
  headerSpacer: {
    width: 44
  },
  listContent: {
    padding: spacing.screenHorizontal,
    gap: 12
  },
  summaryRow: {
    flexDirection: "row",
    gap: 10
  },
  summaryCard: {
    flex: 1,
    minWidth: 0,
    minHeight: 74,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
    ...shadows.card
  },
  summaryValue: {
    color: colors.foreground,
    fontSize: 20,
    fontWeight: "900"
  },
  summaryLabel: {
    color: colors.textPlaceholder,
    fontSize: 11,
    marginTop: 5,
    fontWeight: "700"
  },
  employeeCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    padding: 14,
    gap: 14,
    ...shadows.card
  },
  processingCard: {
    opacity: 0.72
  },
  employeeTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  employeeIdentity: {
    flex: 1,
    minWidth: 0
  },
  employeeName: {
    color: colors.foreground,
    fontSize: 15,
    fontWeight: "900"
  },
  employeeRole: {
    color: colors.textPlaceholder,
    fontSize: 12,
    marginTop: 4,
    fontWeight: "700"
  },
  employeeBottom: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  metricBlock: {
    flex: 1,
    minWidth: 0
  },
  metricLabel: {
    color: colors.textPlaceholder,
    fontSize: 10,
    fontWeight: "700"
  },
  metricValue: {
    color: colors.textSecondary,
    fontSize: 13,
    fontWeight: "900",
    marginTop: 4
  },
  actionRow: {
    minWidth: 118,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8
  },
  iconAction: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: colors.borderLight,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center"
  },
  destructiveAction: {
    borderColor: colors.errorBorder,
    backgroundColor: colors.errorBg
  },
  disabledAction: {
    opacity: 0.5
  },
  emptyWrap: {
    gap: 10
  },
  emptyButton: {
    marginHorizontal: 32
  }
});
