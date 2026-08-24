import React, { useCallback, useEffect, useRef, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import type GorhomBottomSheet from "@gorhom/bottom-sheet";
import { Plus, Receipt } from "lucide-react-native";
import { AppBottomSheet, Button, Input, ScreenHeader } from "@/components/common";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/StateViews";
import { SimpleRow } from "@/screens/shared/ScreenKit";
import { expensesService } from "@/services/expenses.service";
import { colors, spacing } from "@/theme";
import type { ApiExpense, ExpenseCategory, ExpenseListResponse } from "@/types/expense";
import type { PosPaymentMethod } from "@/types/sales";
import { toApiPaymentMethod } from "@/types/sales";
import { formatCurrency } from "@/utils/format";

const methods: Array<{ label: string; value: Exclude<PosPaymentMethod, "credit"> }> = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank", value: "bank" },
  { label: "Mobile", value: "mobile" }
];

export function ExpensesScreen() {
  const sheetRef = useRef<GorhomBottomSheet>(null);
  const [response, setResponse] = useState<ExpenseListResponse | null>(null);
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [method, setMethod] = useState<Exclude<PosPaymentMethod, "credit">>("cash");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [expenseResponse, categoryResponse] = await Promise.all([
        expensesService.list({ limit: 50, search: search.trim() || undefined }),
        expensesService.categories()
      ]);
      setResponse(expenseResponse);
      setCategories(categoryResponse);
      setCategoryId((current) => current ?? categoryResponse[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load expenses.");
    } finally {
      setLoading(false);
    }
  }, [search]);

  useEffect(() => {
    void load();
  }, [load]);

  const resetForm = () => {
    setTitle("");
    setAmount("");
    setDescription("");
    setMethod("cash");
    setCategoryId(categories[0]?.id ?? null);
  };

  const createExpense = async () => {
    const parsedAmount = Number(amount);
    if (!title.trim() || !categoryId || Number.isNaN(parsedAmount) || parsedAmount <= 0) {
      Alert.alert("Missing expense details", "Enter a title, category, and valid amount.");
      return;
    }
    setProcessing(true);
    try {
      await expensesService.create({
        title: title.trim(),
        amount: parsedAmount,
        categoryId,
        description: description.trim() || undefined,
        paymentMethod: toApiPaymentMethod(method)
      });
      resetForm();
      sheetRef.current?.close();
      await load();
    } catch (createError) {
      Alert.alert("Unable to create expense", createError instanceof Error ? createError.message : "Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const renderExpense = ({ item }: { item: ApiExpense }) => (
    <SimpleRow
      title={item.title}
      subtitle={`${item.category.name} | ${new Date(item.expenseDate).toLocaleDateString()} | ${item.paymentMethod}`}
      amount={formatCurrency(Number(item.amount))}
      icon={<Receipt size={17} color={colors.orange} />}
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
          <Pressable style={styles.add} onPress={() => sheetRef.current?.expand()} accessibilityLabel="Add expense">
            <Plus size={18} color={colors.surface} />
          </Pressable>
        }
      />
      <FlatList
        data={response?.data ?? []}
        keyExtractor={(item) => item.id}
        renderItem={renderExpense}
        ListHeaderComponent={
          <View style={styles.headerContent}>
            <Input value={search} onChangeText={setSearch} placeholder="Search expenses" />
            <View style={styles.summary}>
              <Text style={styles.summaryValue}>{formatCurrency(Number(response?.summary.totalExpenses ?? 0))}</Text>
              <Text style={styles.summaryLabel}>{response?.summary.expenseCount ?? 0} expenses</Text>
            </View>
          </View>
        }
        ListEmptyComponent={<EmptyState icon={<Receipt size={22} color={colors.textMuted} />} title="No expenses found" />}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
      <AppBottomSheet ref={sheetRef} snapPoints={["78%"]}>
        <ScrollView contentContainerStyle={styles.sheet}>
          <Text style={styles.sheetTitle}>New Expense</Text>
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
          <Button label="Save Expense" loading={processing} onPress={() => void createExpense()} />
        </ScrollView>
      </AppBottomSheet>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenHorizontal, paddingBottom: spacing.bottomNavHeight + 28, gap: spacing.sectionGap },
  add: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  headerContent: { gap: 12 },
  summary: { padding: 14, borderRadius: 12, backgroundColor: colors.warningBg, borderWidth: 1, borderColor: colors.warningBorder },
  summaryValue: { color: colors.foreground, fontSize: 19, fontWeight: "800" },
  summaryLabel: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  sheet: { padding: spacing.screenHorizontal, gap: 12, paddingBottom: 32 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  label: { color: colors.textTertiary, fontSize: 11, fontWeight: "800" },
  chips: { gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8 },
  activeChip: { backgroundColor: colors.secondaryBg, borderColor: colors.primary },
  chipText: { color: colors.textTertiary, fontSize: 11, fontWeight: "800" },
  activeChipText: { color: colors.primary },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  method: { width: "47.8%", borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, alignItems: "center" }
});
