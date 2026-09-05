import React, { useCallback, useEffect, useRef, useState } from "react";
import type GorhomBottomSheet from "@gorhom/bottom-sheet";
import { Alert, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Archive, DollarSign, Package, PackagePlus, Printer, Search, ShoppingBag } from "lucide-react-native";
import { AppBottomSheet, Avatar, Badge, Button, Card, EmptyState, ErrorState, LoadingState, ScreenHeader, SearchBar, statusVariant } from "@/components/common";
import { employeesService } from "@/services/employees.service";
import { goodsDisbursementService } from "@/services/goods-disbursement.service";
import { printingService } from "@/services/printing.service";
import { productsService } from "@/services/products.service";
import { salesService } from "@/services/sales.service";
import { useAuthStore } from "@/store/authStore";
import { colors, spacing } from "@/theme";
import type { ApiEmployee, EmployeeProfileResponse, EmployeeSalesResponse } from "@/types/employee";
import type { ApiProduct } from "@/types/product";
import type { ApiSale } from "@/types/sales";
import { formatCurrency } from "@/utils/format";

type ProfileTab = "stock" | "supplies" | "sales";
type EmployeeStockProduct = NonNullable<EmployeeProfileResponse["profileActivity"]>["stock"][number];

function customerName(sale: ApiSale) {
  return sale.customer
    ? sale.customer.companyName ||
        [sale.customer.firstName, sale.customer.lastName].filter(Boolean).join(" ")
    : "Walk-in Customer";
}

function salePaymentMethod(sale: ApiSale) {
  return sale.payments[0]?.paymentMethod ?? (Number(sale.balanceDue) > 0 ? "CREDIT" : "UNPAID");
}

function compactDate(value?: string | null) {
  if (!value) return "--";
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function relativeTime(value?: string | null) {
  if (!value) return "--";
  const deltaMs = Date.now() - new Date(value).getTime();
  if (deltaMs < 60_000) return "Now";
  const minutes = Math.floor(deltaMs / 60_000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function employeeName(employee: ApiEmployee) {
  return `${employee.firstName} ${employee.lastName}`.trim() || employee.user.username;
}

export function EmployeeDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const employeeId = route.params?.employeeId as string;
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const saleSheetRef = useRef<GorhomBottomSheet>(null);
  const supplySheetRef = useRef<GorhomBottomSheet>(null);
  const [profile, setProfile] = useState<EmployeeProfileResponse | null>(null);
  const [sales, setSales] = useState<EmployeeSalesResponse | null>(null);
  const [salesQuery, setSalesQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ProfileTab>("stock");
  const [supplySheetVisible, setSupplySheetVisible] = useState(false);
  const [supplyProducts, setSupplyProducts] = useState<ApiProduct[]>([]);
  const [supplyProductsLoading, setSupplyProductsLoading] = useState(false);
  const [selectedSupplyProductId, setSelectedSupplyProductId] = useState<string | null>(null);
  const [supplyQuantity, setSupplyQuantity] = useState("1");
  const [supplyRemarks, setSupplyRemarks] = useState("");
  const [supplying, setSupplying] = useState(false);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState(false);
  const [loadingMoreSales, setLoadingMoreSales] = useState(false);
  const [selectedSale, setSelectedSale] = useState<ApiSale | null>(null);
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

  const loadSales = useCallback(async (page = 1, showSpinner = true) => {
    if (showSpinner) setSalesLoading(true);
    if (page > 1) setLoadingMoreSales(true);
    setSalesError(false);
    try {
      const response = await employeesService.sales(employeeId, {
        page,
        limit: 10,
        search: salesQuery.trim() || undefined,
        sortBy: "saleDate",
        sortOrder: "desc"
      });
      setSales((current) =>
        page > 1 && current
          ? { ...response, data: [...current.data, ...response.data] }
          : response
      );
    } catch {
      setSalesError(true);
    } finally {
      setSalesLoading(false);
      setLoadingMoreSales(false);
    }
  }, [employeeId, salesQuery]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load])
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadSales(1, !sales);
    }, 350);
    return () => clearTimeout(timer);
  }, [loadSales]);

  useEffect(() => {
    if (!selectedSale) return;
    requestAnimationFrame(() => saleSheetRef.current?.snapToIndex(0));
  }, [selectedSale]);

  useEffect(() => {
    if (!supplySheetVisible) return;
    const frame = requestAnimationFrame(() => supplySheetRef.current?.snapToIndex(0));
    const timer = setTimeout(() => supplySheetRef.current?.snapToIndex(0), 50);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(timer);
    };
  }, [supplySheetVisible]);

  const openSale = (sale: ApiSale) => {
    setSelectedSale(sale);
  };

  const editProduct = (productId: string) => {
    const parent = navigation.getParent?.();
    if (parent) parent.navigate("ProductForm" as never, { productId } as never);
    else navigation.navigate("ProductForm", { productId });
  };

  const deleteProduct = (item: EmployeeStockProduct) => {
    Alert.alert("Delete product?", `${item.productName} will be removed from inventory.`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await productsService.deactivate(item.productId);
            await load();
          } catch (deleteError) {
            const message = deleteError instanceof Error ? deleteError.message : "Unable to delete product.";
            Alert.alert("Unable to delete", message);
          }
        }
      }
    ]);
  };

  const openProductActions = (item: EmployeeStockProduct) => {
    Alert.alert(item.productName, "Choose an action for this product.", [
      { text: "Edit", onPress: () => editProduct(item.productId) },
      { text: "Delete", style: "destructive", onPress: () => deleteProduct(item) },
      { text: "Cancel", style: "cancel" }
    ]);
  };

  const openSupplySheet = async () => {
    setSupplySheetVisible(true);
    if (supplyProducts.length) {
      setSelectedSupplyProductId((current) => current ?? supplyProducts[0]?.id ?? null);
      return;
    }
    setSupplyProductsLoading(true);
    try {
      const response = await productsService.list({
        page: 1,
        limit: 100,
        available: true,
        sortBy: "name",
        sortOrder: "asc"
      });
      setSupplyProducts(response.data);
      setSelectedSupplyProductId((current) => current ?? response.data[0]?.id ?? null);
    } catch (supplyError) {
      const message = supplyError instanceof Error ? supplyError.message : "Unable to load products for supply.";
      Alert.alert("Unable to load products", message);
    } finally {
      setSupplyProductsLoading(false);
    }
  };

  const submitSupply = async () => {
    if (!profile || supplying) return;
    const quantity = Number.parseInt(supplyQuantity, 10);
    const selectedProduct = supplyProducts.find((product) => product.id === selectedSupplyProductId);
    const targetName = employeeName(profile.employee);
    if (!selectedProduct) {
      Alert.alert("Select product", "Choose a product to supply to this employee.");
      return;
    }
    if (!Number.isFinite(quantity) || quantity < 1) {
      Alert.alert("Invalid quantity", "Enter a quantity of at least 1.");
      return;
    }

    setSupplying(true);
    try {
      await goodsDisbursementService.create({
        employeeId: profile.employee.id,
        destination: targetName,
        remarks: supplyRemarks.trim() || `Supplied to ${targetName} (${profile.employee.employeeCode})`,
        items: [{ productId: selectedProduct.id, quantity }]
      });
      supplySheetRef.current?.close();
      setSupplySheetVisible(false);
      setSelectedSupplyProductId(null);
      setSupplyProducts([]);
      setSupplyQuantity("1");
      setSupplyRemarks("");
      setActiveTab("stock");
      await load();
      Alert.alert("Supply recorded", `${selectedProduct.name} was supplied to ${targetName}.`);
    } catch (supplyError) {
      const message = supplyError instanceof Error ? supplyError.message : "Unable to supply product.";
      Alert.alert("Supply failed", message);
    } finally {
      setSupplying(false);
    }
  };

  const printSalesRecord = async () => {
    if (!profile) return;
    try {
      const response = await employeesService.printSales(profile.employee.id, {
        search: salesQuery.trim() || undefined,
        sortBy: "saleDate",
        sortOrder: "desc"
      });
      await printingService.printText(response.text);
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : "Unable to print sales record.";
      Alert.alert("Unable to print", message);
    }
  };

  const printReceipt = async () => {
    if (!selectedSale?.receipt?.id) return;
    try {
      const response = await salesService.printReceipt(selectedSale.receipt.id);
      await printingService.printText(response.text);
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : "Unable to print receipt.";
      Alert.alert("Unable to print", message);
    }
  };

  if (loading) return <LoadingState label="Loading employee" />;
  if (error || !profile) return <ErrorState onRetry={load} />;

  const employee = profile.employee;
  const name = employeeName(employee);
  const role = employee.user.role?.name ?? employee.designation ?? "Employee";
  const latestSession = profile.recentSessions[0];
  const activity = profile.profileActivity;
  const displayStatus = employee.canLogin ? employee.status : "DISABLED";
  const normalizedUserRole = user?.roleName?.trim().toLowerCase();
  const isOwner = normalizedUserRole ? normalizedUserRole === "owner" : user?.role === "owner";
  const salesToday = activity?.stats.salesToday ?? 0;
  const totalSupplied = activity?.stats.totalSupplied ?? 0;
  const stockItems = activity?.stock ?? [];
  const supplyRuns = activity?.supplies.data ?? [];

  const renderTabContent = () => {
    if (activeTab === "stock") {
      return (
        <View style={styles.tabContent}>
          <View style={styles.stockSummary}>
            <View>
              <Text style={styles.summaryLabel}>Total Stock Value</Text>
              <Text style={styles.summaryValue}>{formatCurrency(Number(activity?.stats.stockValue ?? 0))}</Text>
            </View>
            <View style={styles.summaryRight}>
              <Text style={styles.summaryLabel}>Items</Text>
              <Text style={styles.summaryValue}>{activity?.stats.stockItems ?? 0}</Text>
            </View>
          </View>
          {stockItems.length ? stockItems.map((item) => (
            <Pressable
              key={item.productId}
              disabled={!isOwner}
              onPress={() => openProductActions(item)}
              accessibilityRole={isOwner ? "button" : undefined}
              accessibilityLabel={isOwner ? `Manage ${item.productName}` : undefined}
            >
              <Card style={styles.productCard}>
                <View style={styles.productHead}>
                  <View style={styles.productIcon}><Package size={16} color={colors.primary} /></View>
                  <View style={styles.productBody}>
                    <Text style={styles.productTitle}>{item.productName}</Text>
                    <Text style={styles.productMeta}>{item.sku ?? item.barcode ?? item.productId.slice(0, 8)}</Text>
                  </View>
                  <View style={styles.quantityBlock}>
                    <Text style={styles.quantity}>{item.quantityInHand}</Text>
                    <Text style={styles.productMeta}>In hand</Text>
                  </View>
                </View>
                <View style={styles.progressTrack}>
                  <View style={[styles.progressFill, { width: `${Math.min(100, Math.max(6, item.quantitySold ? (item.quantitySold / Math.max(item.quantitySold + item.quantityInHand, 1)) * 100 : 6))}%` }]} />
                </View>
                <View style={styles.productFoot}>
                  <Text style={styles.productMeta}>Supplied: {item.suppliedQuantity} | Sold: {item.quantitySold}</Text>
                  <Text style={styles.productMeta}>{formatCurrency(Number(item.unitValue))}/unit | Last: {compactDate(item.lastActivityAt)}</Text>
                </View>
              </Card>
            </Pressable>
          )) : (
            <EmptyState icon={<Package size={28} color={colors.textPlaceholder} />} title="No stock activity yet" />
          )}
        </View>
      );
    }

    if (activeTab === "supplies") {
      return (
        <View style={styles.tabContent}>
          <Card style={styles.supplySummary}>
            <InfoLine label="Total Supply Run" value={String(activity?.supplies.summary.totalSupplyRuns ?? 0)} />
            <InfoLine label="Total Value Supplied" value={formatCurrency(Number(activity?.supplies.summary.totalSuppliedValue ?? 0))} valueColor={colors.primary} />
          </Card>
          {supplyRuns.length ? supplyRuns.map((run) => (
            <Card key={run.id} style={styles.supplyCard}>
              <View style={styles.productHead}>
                <View style={styles.supplyIcon}><Archive size={16} color={colors.primary} /></View>
                <View style={styles.productBody}>
                  <Text style={styles.productTitle}>{run.disbursementNumber}</Text>
                  <Text style={styles.productMeta}>{run.destination ?? "No destination"} | {compactDate(run.disbursementDate)}</Text>
                </View>
                <Text style={styles.quantity}>{run.totalQuantity}</Text>
              </View>
              <Text style={styles.productMeta}>{formatCurrency(Number(run.totalValue))} supplied value</Text>
            </Card>
          )) : (
            <EmptyState icon={<Archive size={28} color={colors.textPlaceholder} />} title="No supply records yet" />
          )}
        </View>
      );
    }

    return (
      <View style={styles.tabContent}>
        <View style={styles.salesHero}>
          <View style={styles.salesIcon}><DollarSign size={22} color={colors.successDark} /></View>
          <Text style={styles.salesHeroLabel}>Sales Today</Text>
          <Text style={styles.salesHeroValue}>{salesToday}</Text>
          <Text style={styles.productMeta}>transactions recorded today</Text>
        </View>
        <Card style={styles.activityCard}>
          <InfoLine label="Last Active" value={relativeTime(employee.lastLogin ?? employee.user.lastLogin ?? latestSession?.updatedAt)} />
          <InfoLine label="Role" value={role} />
          <InfoLine label="Joined" value="--" />
          <InfoLine label="Phone" value={employee.phone ?? "--"} />
          <InfoLine label="Username" value={employee.user.username} />
        </Card>
        <Card style={styles.salesCard}>
          <View style={styles.sectionHeader}>
            <View>
              <Text style={styles.sectionTitle}>Sales Records</Text>
              <Text style={styles.sectionMeta}>Completed totals from recorded sales</Text>
            </View>
            <Button label="Print" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void printSalesRecord()} style={styles.smallButton} />
          </View>
          <View style={styles.salesStats}>
            <View style={styles.salesStat}>
              <Text style={styles.value}>{formatCurrency(Number(sales?.summary.totalSalesValue ?? 0))}</Text>
              <Text style={styles.label}>Total Sales</Text>
            </View>
            <View style={styles.salesStat}>
              <Text style={styles.value}>{sales?.summary.completedSalesCount ?? 0}</Text>
              <Text style={styles.label}>Completed</Text>
            </View>
          </View>
          <SearchBar value={salesQuery} onChangeText={setSalesQuery} placeholder="Search employee sales" />
          {salesLoading ? (
            <LoadingState label="Loading sales" />
          ) : salesError ? (
            <ErrorState onRetry={() => void loadSales()} />
          ) : sales?.data.length ? (
            <View style={styles.salesList}>
              {sales.data.map((sale) => (
                <Pressable key={sale.id} style={styles.saleRow} onPress={() => openSale(sale)} accessibilityRole="button" accessibilityLabel={`Open ${sale.saleNumber}`}>
                  <View style={styles.saleIcon}><ShoppingBag size={15} color={colors.primary} /></View>
                  <View style={styles.saleBody}>
                    <Text style={styles.item}>{sale.saleNumber}</Text>
                    <Text style={styles.label}>{compactDate(sale.saleDate)} | {salePaymentMethod(sale)}</Text>
                  </View>
                  <View style={styles.saleRight}>
                    <Text style={styles.item}>{formatCurrency(Number(sale.totalAmount))}</Text>
                    <Badge label={sale.status} variant={statusVariant(sale.status)} />
                  </View>
                </Pressable>
              ))}
              {sales.meta.page < sales.meta.totalPages ? (
                <Button label={loadingMoreSales ? "Loading" : "Load More"} variant="ghost" loading={loadingMoreSales} onPress={() => void loadSales(sales.meta.page + 1, false)} />
              ) : null}
            </View>
          ) : (
            <EmptyState icon={<Search size={24} color={colors.textPlaceholder} />} title="No sales found" />
          )}
        </Card>
      </View>
    );
  };

  return (
    <View style={styles.screen}>
      <ScreenHeader
        title={name}
        onBack={() => navigation.goBack()}
        right={
          <Pressable style={styles.supplyButton} onPress={() => void openSupplySheet()} accessibilityRole="button" accessibilityLabel={`Supply products to ${name}`} hitSlop={8}>
            <PackagePlus size={14} color={colors.surface} />
            <Text style={styles.supplyButtonText}>Supply</Text>
          </Pressable>
        }
      />
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.bottomNavHeight + Math.max(insets.bottom, 32) + 64 }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.profileCard}>
          <Avatar name={name} imageUri={employee.profileImage ?? undefined} size={58} />
          <View style={styles.profileBody}>
            <Text style={styles.profileName}>{name}</Text>
            <Text style={styles.profileRole}>{role}</Text>
          </View>
          <Badge label={displayStatus.toLowerCase()} variant={employee.canLogin && employee.status === "ACTIVE" ? "success" : "warning"} />
        </View>

        <View style={styles.statRow}>
          <MetricCard value={activity?.stats.stockItems ?? 0} label="Stock Items" tone="blue" />
          <MetricCard value={formatCurrency(Number(activity?.stats.stockValue ?? 0))} label="Stock Value" tone="purple" />
          <MetricCard value={totalSupplied} label="Total Supplied" tone="orange" />
          <MetricCard value={salesToday} label="Sales Today" tone="green" />
        </View>

        <View style={styles.tabs}>
          {(["stock", "supplies", "sales"] as ProfileTab[]).map((tab) => (
            <Pressable
              key={tab}
              onPressIn={() => setActiveTab(tab)}
              onPress={() => setActiveTab(tab)}
              hitSlop={8}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              accessibilityRole="button"
              accessibilityLabel={`View ${tab}`}
            >
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab[0].toUpperCase() + tab.slice(1)}</Text>
            </Pressable>
          ))}
        </View>

        {renderTabContent()}

      </ScrollView>

      {selectedSale ? (
        <AppBottomSheet ref={saleSheetRef} snapPoints={["82%"]} onClose={() => setSelectedSale(null)}>
          <ScrollView contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) }]}>
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>{selectedSale.saleNumber}</Text>
                <Text style={styles.sectionMeta}>{new Date(selectedSale.saleDate).toLocaleString()}</Text>
              </View>
              {selectedSale.receipt?.id ? <Button label="Receipt" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void printReceipt()} style={styles.smallButton} /> : null}
            </View>
            <Card style={styles.infoCard}>
              <InfoLine label="Employee" value={name} />
              <InfoLine label="Customer" value={customerName(selectedSale)} />
              <InfoLine label="Payment" value={salePaymentMethod(selectedSale)} />
              <InfoLine label="Status" value={`${selectedSale.status} / ${selectedSale.paymentStatus}`} />
              <InfoLine label="Subtotal" value={formatCurrency(Number(selectedSale.subtotal))} />
              <InfoLine label="Discount" value={formatCurrency(Number(selectedSale.discountAmount))} />
              <InfoLine label="Tax" value={formatCurrency(Number(selectedSale.taxAmount))} />
              <InfoLine label="Total" value={formatCurrency(Number(selectedSale.totalAmount))} />
            </Card>
            <Card style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Products</Text>
              {selectedSale.items.map((item) => (
                <View key={item.id} style={styles.productRow}>
                  <View style={styles.saleBody}>
                    <Text style={styles.item}>{item.product.name}</Text>
                    <Text style={styles.label}>Qty {item.quantity} x {formatCurrency(Number(item.unitPrice))}</Text>
                  </View>
                  <Text style={styles.item}>{formatCurrency(Number(item.totalAmount))}</Text>
                </View>
              ))}
            </Card>
            <Card style={styles.infoCard}>
              <Text style={styles.sectionTitle}>Payments</Text>
              {selectedSale.payments.length ? selectedSale.payments.map((payment) => (
                <View key={payment.id} style={styles.productRow}>
                  <View style={styles.saleBody}>
                    <Text style={styles.item}>{payment.paymentMethod}</Text>
                    <Text style={styles.label}>{compactDate(payment.paymentDate)}</Text>
                  </View>
                  <Text style={styles.item}>{formatCurrency(Number(payment.amount))}</Text>
                </View>
              )) : <Text style={styles.label}>No payments recorded</Text>}
            </Card>
          </ScrollView>
        </AppBottomSheet>
      ) : null}

      {supplySheetVisible ? (
        <AppBottomSheet ref={supplySheetRef} snapPoints={["82%"]} onClose={() => setSupplySheetVisible(false)}>
          <ScrollView contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 16) }]} keyboardShouldPersistTaps="handled">
            <View>
              <Text style={styles.sectionTitle}>Supply Products</Text>
              <Text style={styles.sectionMeta}>{name}</Text>
            </View>
            {supplyProductsLoading ? (
              <LoadingState label="Loading products" />
            ) : supplyProducts.length ? (
              <View style={styles.productPicker}>
                {supplyProducts.map((product) => {
                  const selected = product.id === selectedSupplyProductId;
                  return (
                    <Pressable
                      key={product.id}
                      style={[styles.productOption, selected && styles.productOptionSelected]}
                      onPress={() => setSelectedSupplyProductId(product.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Select ${product.name}`}
                    >
                      <View style={styles.saleBody}>
                        <Text style={styles.item}>{product.name}</Text>
                        <Text style={styles.label}>{product.sku} | Available: {product.inventory?.quantityAvailable ?? 0}</Text>
                      </View>
                      <Badge label={selected ? "Selected" : "Supply"} variant={selected ? "success" : "neutral"} />
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <EmptyState icon={<Package size={28} color={colors.textPlaceholder} />} title="No available products" />
            )}
            <View style={styles.formGroup}>
              <Text style={styles.infoLabel}>Quantity</Text>
              <TextInput
                value={supplyQuantity}
                onChangeText={setSupplyQuantity}
                keyboardType="number-pad"
                style={styles.textInput}
                placeholder="1"
                placeholderTextColor={colors.textPlaceholder}
                accessibilityLabel="Supply quantity"
              />
            </View>
            <View style={styles.formGroup}>
              <Text style={styles.infoLabel}>Remarks</Text>
              <TextInput
                value={supplyRemarks}
                onChangeText={setSupplyRemarks}
                style={[styles.textInput, styles.remarksInput]}
                placeholder="Optional"
                placeholderTextColor={colors.textPlaceholder}
                multiline
                accessibilityLabel="Supply remarks"
              />
            </View>
            <Button label="Record Supply" loading={supplying} disabled={!supplyProducts.length || supplying} onPress={() => void submitSupply()} />
          </ScrollView>
        </AppBottomSheet>
      ) : null}
    </View>
  );
}

function MetricCard({ value, label, tone }: { value: string | number; label: string; tone: "blue" | "green" | "orange" | "purple" }) {
  const color = tone === "green" ? colors.success : tone === "orange" ? colors.orange : tone === "purple" ? colors.purple : colors.primary;
  return (
    <Card style={styles.metricCard}>
      <Text style={[styles.metricValue, { color }]} numberOfLines={1}>{value}</Text>
      <Text style={styles.metricLabel} numberOfLines={2}>{label}</Text>
    </Card>
  );
}

function InfoLine({ label, value, valueColor }: { label: string; value: string; valueColor?: string }) {
  return (
    <View style={styles.infoLine}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, valueColor ? { color: valueColor } : null]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  scroller: { flex: 1 },
  scrollContent: { flexGrow: 1, paddingHorizontal: spacing.screenHorizontal, paddingTop: 12, gap: 12 },
  supplyButton: { minHeight: 34, borderRadius: 17, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, backgroundColor: colors.primary },
  supplyButtonText: { color: colors.surface, fontSize: 12, fontWeight: "800" },
  profileCard: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
  profileBody: { flex: 1 },
  profileName: { color: colors.foreground, fontSize: 16, fontWeight: "900" },
  profileRole: { color: colors.textPlaceholder, fontSize: 12, marginTop: 3, fontWeight: "700" },
  statRow: { flexDirection: "row", gap: 8 },
  metricCard: { flex: 1, minHeight: 76, alignItems: "center", justifyContent: "center", paddingHorizontal: 5, paddingVertical: 8 },
  metricValue: { fontSize: 13, fontWeight: "900", textAlign: "center" },
  metricLabel: { color: colors.textPlaceholder, fontSize: 9, fontWeight: "700", textAlign: "center", marginTop: 5 },
  tabs: { flexDirection: "row", gap: 8, marginTop: 2 },
  tab: { flex: 1, minHeight: 38, borderRadius: 19, borderWidth: 1, borderColor: colors.borderLight, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center" },
  tabActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  tabText: { color: colors.textMuted, fontSize: 12, fontWeight: "800" },
  tabTextActive: { color: colors.surface },
  tabContent: { gap: 10 },
  stockSummary: { borderRadius: 8, backgroundColor: colors.primary, padding: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  summaryLabel: { color: "rgba(255,255,255,0.78)", fontSize: 11, fontWeight: "700" },
  summaryValue: { color: colors.surface, fontSize: 20, fontWeight: "900", marginTop: 4 },
  summaryRight: { alignItems: "flex-end" },
  productCard: { gap: 9 },
  productHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  productIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.secondaryBg, alignItems: "center", justifyContent: "center" },
  supplyIcon: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.mutedBg, alignItems: "center", justifyContent: "center" },
  productBody: { flex: 1 },
  productTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "900" },
  productMeta: { color: colors.textPlaceholder, fontSize: 10, marginTop: 3 },
  quantityBlock: { alignItems: "flex-end" },
  quantity: { color: colors.foreground, fontSize: 16, fontWeight: "900" },
  progressTrack: { height: 4, borderRadius: 2, backgroundColor: colors.borderLighter, overflow: "hidden" },
  progressFill: { height: 4, borderRadius: 2, backgroundColor: colors.success },
  productFoot: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  supplySummary: { gap: 0 },
  supplyCard: { gap: 8 },
  salesHero: { minHeight: 190, alignItems: "center", justifyContent: "center", gap: 6 },
  salesIcon: { width: 54, height: 54, borderRadius: 27, backgroundColor: colors.successBg, alignItems: "center", justifyContent: "center" },
  salesHeroLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: "900", marginTop: 8 },
  salesHeroValue: { color: colors.success, fontSize: 36, fontWeight: "900" },
  activityCard: { gap: 0 },
  infoLine: { minHeight: 34, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.borderLighter },
  infoLabel: { color: colors.textPlaceholder, fontSize: 11, fontWeight: "700" },
  infoValue: { color: colors.textSecondary, fontSize: 11, fontWeight: "900", textAlign: "right", flexShrink: 1 },
  salesCard: { gap: 14 },
  sectionHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  sectionTitle: { color: colors.foreground, fontSize: 15, fontWeight: "800" },
  sectionMeta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  smallButton: { minHeight: 44, paddingHorizontal: 12 },
  salesStats: { flexDirection: "row", gap: 10 },
  salesStat: { flex: 1, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, padding: 12 },
  value: { color: colors.foreground, fontSize: 17, fontWeight: "800" },
  label: { color: colors.textPlaceholder, fontSize: 11, marginTop: 4 },
  salesList: { gap: 8 },
  saleRow: { flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, padding: 10 },
  saleIcon: { width: 36, height: 36, borderRadius: 8, backgroundColor: colors.secondaryBg, alignItems: "center", justifyContent: "center" },
  saleBody: { flex: 1, gap: 3 },
  saleRight: { alignItems: "flex-end", gap: 5 },
  item: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  infoCard: { gap: 12 },
  sheetContent: { padding: 16, gap: 12 },
  productRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  productPicker: { gap: 8 },
  productOption: { minHeight: 62, flexDirection: "row", alignItems: "center", gap: 10, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, padding: 10, backgroundColor: colors.surface },
  productOptionSelected: { borderColor: colors.primary, backgroundColor: colors.secondaryBg },
  formGroup: { gap: 6 },
  textInput: { minHeight: 48, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, paddingHorizontal: 12, color: colors.foreground, backgroundColor: colors.inputBg },
  remarksInput: { minHeight: 76, paddingTop: 12, textAlignVertical: "top" }
});
