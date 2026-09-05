import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import type GorhomBottomSheet from "@gorhom/bottom-sheet";
import { Edit3, Plus, Printer, Receipt, Trash2, X } from "lucide-react-native";
import { AppBottomSheet, Button, Card, Input, ScreenHeader, SearchBar } from "@/components/common";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateViews";
import { SimpleRow } from "@/screens/shared/ScreenKit";
import { expensesService } from "@/services/expenses.service";
import { printingService } from "@/services/printing.service";
import { useAuthStore } from "@/store/authStore";
import { colors, spacing } from "@/theme";
import type { ApiExpense, ExpenseCategory, ExpenseListResponse } from "@/types/expense";
import type { PosPaymentMethod } from "@/types/sales";
import { fromApiPaymentMethod, toApiPaymentMethod } from "@/types/sales";
import { formatCurrency } from "@/utils/format";

const methods: Array<{ label: string; value: Exclude<PosPaymentMethod, "credit"> }> = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank", value: "bank" },
  { label: "Mobile", value: "mobile" }
];

const reportRoleNames = new Set(["Owner", "Admin", "Manager", "Accountant"]);

function formatDate(value: string) {
  return new Date(value).toLocaleDateString();
}

function expensePrintText(expense: ApiExpense) {
  return [
    "Expense Record",
    "------------------------------",
    `Expense: ${expense.expenseNumber}`,
    `Employee: ${expense.recordedBy.name || expense.recordedBy.username}`,
    `Date: ${formatDate(expense.expenseDate)}`,
    `Category: ${expense.category.name}`,
    `Title: ${expense.title}`,
    `Description: ${expense.description ?? "Not set"}`,
    `Method: ${expense.paymentMethod}`,
    `Amount: ${formatCurrency(Number(expense.amount))}`
  ].join("\n");
}

export function ExpensesScreen() {
  const sheetRef = useRef<GorhomBottomSheet>(null);
  const hasLoadedRef = useRef(false);
  const user = useAuthStore((state) => state.user);
  const canViewEmployeeTotals = reportRoleNames.has(user?.roleName ?? "");
  const [response, setResponse] = useState<ExpenseListResponse | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [selectedEmployeeUserId, setSelectedEmployeeUserId] = useState<string | null>(null);
  const [selectedExpense, setSelectedExpense] = useState<ApiExpense | null>(null);
  const [sheetMode, setSheetMode] = useState<"create" | "detail" | null>(null);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [method, setMethod] = useState<Exclude<PosPaymentMethod, "credit">>("cash");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedEmployeeSummary = useMemo(
    () => response?.summary.expensesByEmployee.find((employee) => employee.userId === selectedEmployeeUserId),
    [response, selectedEmployeeUserId]
  );

  const canMutateSelectedExpense = Boolean(selectedExpense && selectedExpense.recordedBy.id === user?.id);

  const load = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    setError(null);
    try {
      const params = {
        limit: 50,
        search: search.trim() || undefined,
        userId: selectedEmployeeUserId ?? undefined
      };
      const [expenseResponse, categoryResponse] = await Promise.all([
        expensesService.list(params),
        expensesService.categories()
      ]);
      setResponse(expenseResponse);
      setCategories(categoryResponse);
      setCategoryId((current) => current ?? categoryResponse[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load expenses.");
    } finally {
      setLoading(false);
      setRefreshing(false);
      hasLoadedRef.current = true;
    }
  }, [search, selectedEmployeeUserId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load(!hasLoadedRef.current);
    }, hasLoadedRef.current ? 350 : 0);
    return () => clearTimeout(timer);
  }, [load]);

  const resetForm = useCallback(() => {
    setTitle("");
    setAmount("");
    setDescription("");
    setMethod("cash");
    setCategoryId(categories[0]?.id ?? null);
  }, [categories]);

  const populateForm = (expense: ApiExpense) => {
    const nextMethod = fromApiPaymentMethod(expense.paymentMethod);
    setTitle(expense.title);
    setAmount(String(expense.amount));
    setDescription(expense.description ?? "");
    setCategoryId(expense.category.id);
    setMethod(nextMethod === "credit" ? "cash" : nextMethod);
  };

  const openCreate = () => {
    setSelectedExpense(null);
    setSheetMode("create");
    resetForm();
  };

  const openExpense = async (expense: ApiExpense) => {
    setSheetMode("detail");
    setSelectedExpense(expense);
    populateForm(expense);
    setDetailLoading(true);
    try {
      const detail = await expensesService.detail(expense.id);
      setSelectedExpense(detail);
      populateForm(detail);
    } catch (detailError) {
      Alert.alert("Unable to open expense", detailError instanceof Error ? detailError.message : "Please try again.");
      sheetRef.current?.close();
    } finally {
      setDetailLoading(false);
    }
  };

  const saveExpense = async () => {
    const parsedAmount = Number(amount);
    if (!title.trim() || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Missing expense details", "Enter a title and valid amount.");
      return;
    }

    setProcessing(true);
    try {
      const payload = {
        title: title.trim(),
        amount: parsedAmount,
        categoryId: categoryId ?? undefined,
        description: description.trim() || undefined,
        paymentMethod: toApiPaymentMethod(method)
      };
      if (selectedExpense) {
        await expensesService.update(selectedExpense.id, payload);
      } else {
        await expensesService.create(payload);
      }
      resetForm();
      setSelectedExpense(null);
      setSheetMode(null);
      sheetRef.current?.close();
      await load(false);
    } catch (saveError) {
      Alert.alert("Unable to save expense", saveError instanceof Error ? saveError.message : "Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const deleteExpense = () => {
    if (!selectedExpense) return;
    Alert.alert("Delete expense", "This expense will be removed from totals.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setProcessing(true);
          try {
            await expensesService.remove(selectedExpense.id);
            setSelectedExpense(null);
            setSheetMode(null);
            sheetRef.current?.close();
            await load(false);
          } catch (deleteError) {
            Alert.alert("Unable to delete expense", deleteError instanceof Error ? deleteError.message : "Please try again.");
          } finally {
            setProcessing(false);
          }
        }
      }
    ]);
  };

  const printExpense = async () => {
    if (!selectedExpense) return;
    await printingService.printText(expensePrintText(selectedExpense));
  };

  const refresh = () => {
    setRefreshing(true);
    void load(false);
  };

  const renderExpense = ({ item }: { item: ApiExpense }) => (
    <SimpleRow
      title={item.title}
      subtitle={`${item.recordedBy.name || item.recordedBy.username} | ${item.category.name} | ${formatDate(item.expenseDate)}`}
      amount={formatCurrency(Number(item.amount))}
      icon={<Receipt size={17} color={colors.orange} />}
      onPress={() => void openExpense(item)}
    />
  );

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Expenses" />
        <LoadingState label="Loading expenses" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Expenses" />
        <ErrorState onRetry={() => void load()} />
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title="Expenses"
        right={
          <Pressable style={styles.add} onPress={openCreate} accessibilityRole="button" accessibilityLabel="Add expense">
            <Plus size={18} color={colors.surface} />
          </Pressable>
        }
      />
      <FlatList
        data={response?.data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderExpense}
        refreshing={refreshing}
        onRefresh={refresh}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <View style={styles.searchRow}>
              <View style={styles.searchInput}>
                <SearchBar value={search} onChangeText={setSearch} placeholder="Search expenses" />
              </View>
              {search ? (
                <Pressable onPress={() => setSearch("")} style={styles.clearButton} accessibilityRole="button" accessibilityLabel="Clear expense search">
                  <X size={18} color={colors.textTertiary} />
                </Pressable>
              ) : null}
            </View>
            <Card style={styles.summary}>
              <Text style={styles.summaryLabel}>{selectedEmployeeSummary ? selectedEmployeeSummary.employeeName : "Total Expenses"}</Text>
              <Text style={styles.summaryValue}>{formatCurrency(Number(response?.summary.totalExpenses ?? 0))}</Text>
              <Text style={styles.summaryLabel}>{response?.summary.expenseCount ?? 0} expenses</Text>
            </Card>
            {selectedEmployeeSummary ? (
              <Button label="Show All Employees" variant="ghost" onPress={() => setSelectedEmployeeUserId(null)} />
            ) : null}
            {canViewEmployeeTotals && !selectedEmployeeUserId && (response?.summary.expensesByEmployee.length ?? 0) > 0 ? (
              <>
                <Text style={styles.section}>Employee Expenses</Text>
                <View style={styles.employeeList}>
                  {response?.summary.expensesByEmployee.map((employee) => (
                    <Pressable key={employee.userId} onPress={() => setSelectedEmployeeUserId(employee.userId)} accessibilityRole="button" accessibilityLabel={`View ${employee.employeeName} expenses`}>
                      <Card style={styles.employeeCard}>
                        <View style={styles.employeeBody}>
                          <Text style={styles.employeeName}>{employee.employeeName}</Text>
                          <Text style={styles.employeeMeta}>{employee.expenseCount} expenses</Text>
                        </View>
                        <Text style={styles.employeeAmount}>{formatCurrency(Number(employee.totalAmount))}</Text>
                      </Card>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
            <Text style={styles.section}>{selectedEmployeeSummary ? "Expense Records" : "All Expenses"}</Text>
          </View>
        }
        ListEmptyComponent={<EmptyState icon={<Receipt size={22} color={colors.textMuted} />} title="No expenses found" />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
      {sheetMode ? <AppBottomSheet ref={sheetRef} snapPoints={["84%"]} initialIndex={0} onClose={() => setSheetMode(null)}>
        <ScrollView contentContainerStyle={styles.sheet} showsVerticalScrollIndicator={false}>
          {sheetMode === "detail" && selectedExpense && !canMutateSelectedExpense ? (
            <>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>Expense Details</Text>
                <Pressable style={styles.iconButton} onPress={() => void printExpense()} accessibilityRole="button" accessibilityLabel="Print expense">
                  <Printer size={17} color={colors.primary} />
                </Pressable>
              </View>
              {detailLoading ? <LoadingState label="Loading expense" /> : null}
              <DetailRow label="Employee" value={selectedExpense.recordedBy.name || selectedExpense.recordedBy.username} />
              <DetailRow label="Number" value={selectedExpense.expenseNumber} />
              <DetailRow label="Date" value={formatDate(selectedExpense.expenseDate)} />
              <DetailRow label="Category" value={selectedExpense.category.name} />
              <DetailRow label="Title" value={selectedExpense.title} />
              <DetailRow label="Description" value={selectedExpense.description ?? "Not set"} />
              <DetailRow label="Vendor" value={selectedExpense.vendor ?? "Not set"} />
              <DetailRow label="Payment" value={selectedExpense.paymentMethod} />
              <DetailRow label="Amount" value={formatCurrency(Number(selectedExpense.amount))} />
            </>
          ) : (
            <>
              <View style={styles.sheetHeader}>
                <Text style={styles.sheetTitle}>{selectedExpense ? "Edit Expense" : "New Expense"}</Text>
                {selectedExpense ? (
                  <View style={styles.sheetActions}>
                    <Pressable style={styles.iconButton} onPress={() => void printExpense()} accessibilityRole="button" accessibilityLabel="Print expense">
                      <Printer size={17} color={colors.primary} />
                    </Pressable>
                    <Pressable style={[styles.iconButton, styles.deleteIcon]} onPress={deleteExpense} accessibilityRole="button" accessibilityLabel="Delete expense">
                      <Trash2 size={17} color={colors.error} />
                    </Pressable>
                  </View>
                ) : null}
              </View>
              {detailLoading ? <LoadingState label="Loading expense" /> : null}
              <Input label="Title" value={title} onChangeText={setTitle} placeholder="Expense title" />
              <Input label="Amount" value={amount} onChangeText={setAmount} keyboardType="numeric" placeholder="0.00" />
              <Input label="Description" value={description} onChangeText={setDescription} placeholder="Optional" />
              <Text style={styles.label}>Category</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
                {categories.map((category) => (
                  <Pressable key={category.id} onPress={() => setCategoryId(category.id)} style={[styles.chip, categoryId === category.id && styles.activeChip]}>
                    <Text style={[styles.chipText, categoryId === category.id && styles.activeChipText]}>{category.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>
              <Text style={styles.label}>Payment Method</Text>
              <View style={styles.methodGrid}>
                {methods.map((item) => (
                  <Pressable key={item.value} onPress={() => setMethod(item.value)} style={[styles.method, method === item.value && styles.activeChip]}>
                    <Text style={[styles.chipText, method === item.value && styles.activeChipText]}>{item.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Button label={selectedExpense ? "Save Changes" : "Save Expense"} loading={processing} icon={selectedExpense ? <Edit3 size={18} color={colors.surface} /> : undefined} onPress={() => void saveExpense()} />
            </>
          )}
        </ScrollView>
      </AppBottomSheet> : null}
    </View>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.detailValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenHorizontal, paddingBottom: spacing.bottomNavHeight + 28, gap: spacing.sectionGap },
  add: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  headerContent: { gap: 12 },
  searchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  searchInput: { flex: 1 },
  clearButton: { width: 44, height: 44, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.borderLight },
  summary: { backgroundColor: colors.warningBg, borderColor: colors.warningBorder },
  summaryValue: { color: colors.foreground, fontSize: 19, fontWeight: "800", marginTop: 3 },
  summaryLabel: { color: colors.textPlaceholder, fontSize: 11, fontWeight: "700" },
  section: { color: colors.textTertiary, fontSize: 13, fontWeight: "800", marginTop: 2 },
  employeeList: { gap: 8 },
  employeeCard: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  employeeBody: { flex: 1 },
  employeeName: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  employeeMeta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  employeeAmount: { color: colors.foreground, fontSize: 13, fontWeight: "800" },
  sheet: { padding: spacing.screenHorizontal, gap: 12, paddingBottom: 32 },
  sheetHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  sheetActions: { flexDirection: "row", gap: 8 },
  iconButton: { width: 38, height: 38, borderRadius: 12, borderWidth: 1, borderColor: colors.borderLight, alignItems: "center", justifyContent: "center", backgroundColor: colors.surface },
  deleteIcon: { borderColor: colors.errorBorder, backgroundColor: colors.errorBg },
  label: { color: colors.textTertiary, fontSize: 11, fontWeight: "800" },
  detailRow: { gap: 4, paddingVertical: 4 },
  detailValue: { color: colors.textSecondary, fontSize: 14, fontWeight: "700" },
  chips: { gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  activeChip: { backgroundColor: colors.secondaryBg, borderColor: colors.primary },
  chipText: { color: colors.textTertiary, fontSize: 11, fontWeight: "800" },
  activeChipText: { color: colors.primary },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  method: { width: "47.8%", borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center" }
});
