import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type GorhomBottomSheet from "@gorhom/bottom-sheet";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Alert, Keyboard, Modal, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Text } from "@/i18n";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Archive, DollarSign, FileDown, Package, PackagePlus, Printer, Search, Send, ShoppingBag, Trash2, Wallet } from "lucide-react-native";
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
import { mapReceiptToDocument } from "@/types/sales";
import { dashboardEvents } from "@/utils/dashboardEvents";
import { formatCurrency } from "@/utils/format";

type ProfileTab = "stock" | "supplies" | "sales";
type EmployeeStockProduct = NonNullable<EmployeeProfileResponse["profileActivity"]>["stock"][number];
type EmployeeSupplyRun = NonNullable<EmployeeProfileResponse["profileActivity"]>["supplies"]["data"][number];

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

function dayRangeFromSearch(value: string) {
  const query = value.trim();
  if (!query) return null;

  const isoMatch = query.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  const localMatch = query.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})$/);
  const year = isoMatch
    ? Number(isoMatch[1])
    : localMatch
      ? Number(localMatch[3].length === 2 ? `20${localMatch[3]}` : localMatch[3])
      : null;
  const month = isoMatch ? Number(isoMatch[2]) : localMatch ? Number(localMatch[2]) : null;
  const day = isoMatch ? Number(isoMatch[3]) : localMatch ? Number(localMatch[1]) : null;

  if (!year || !month || !day) return null;

  const parsed = new Date(year, month - 1, day);
  if (
    Number.isNaN(parsed.getTime()) ||
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return null;
  }

  const start = new Date(parsed);
  start.setHours(0, 0, 0, 0);
  const end = new Date(parsed);
  end.setHours(23, 59, 59, 999);

  return {
    startDate: start.toISOString(),
    endDate: end.toISOString()
  };
}

function employeeName(employee: ApiEmployee) {
  return `${employee.firstName} ${employee.lastName}`.trim() || employee.user.username;
}

function supplyRunProductTitle(run: EmployeeSupplyRun) {
  const productNames = run.items
    .map((item) => item.productName?.trim())
    .filter((name): name is string => Boolean(name));

  if (!productNames.length) return "Supplied products";
  if (productNames.length === 1) return productNames[0];
  if (productNames.length === 2) return productNames.join(", ");
  return `${productNames.slice(0, 2).join(", ")} +${productNames.length - 2} more`;
}

export function EmployeeDetailScreen({ route, navigation }: { route: any; navigation: any }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const canManageProducts = useAuthStore((state) => state.can("products.manage"));
  const isSelfProfile = route.name === "EmployeeSelfProfile";
  const employeeId = isSelfProfile ? user?.employeeId ?? "" : (route.params?.employeeId as string | undefined) ?? "";
  const saleSheetRef = useRef<GorhomBottomSheet>(null);
  const [profile, setProfile] = useState<EmployeeProfileResponse | null>(null);
  const [sales, setSales] = useState<EmployeeSalesResponse | null>(null);
  const [stockQuery, setStockQuery] = useState("");
  const [suppliesQuery, setSuppliesQuery] = useState("");
  const [salesQuery, setSalesQuery] = useState("");
  const [activeTab, setActiveTab] = useState<ProfileTab>("stock");
  const [supplySheetVisible, setSupplySheetVisible] = useState(false);
  const [supplyProducts, setSupplyProducts] = useState<ApiProduct[]>([]);
  const [supplyProductsLoading, setSupplyProductsLoading] = useState(false);
  const [supplyProductSearch, setSupplyProductSearch] = useState("");
  const [selectedSupplyProductId, setSelectedSupplyProductId] = useState<string | null>(null);
  const [expandedSupplyRunId, setExpandedSupplyRunId] = useState<string | null>(null);
  const [supplyQuantity, setSupplyQuantity] = useState("1");
  const [supplyReview, setSupplyReview] = useState(false);
  const [supplyKeyboardHeight, setSupplyKeyboardHeight] = useState(0);
  const supplyScrollRef = useRef<ScrollView>(null);
  useEffect(() => {
    const show = Keyboard.addListener("keyboardDidShow", (event) => setSupplyKeyboardHeight(event.endCoordinates.height));
    const hide = Keyboard.addListener("keyboardDidHide", () => setSupplyKeyboardHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);
  const [supplyCart, setSupplyCart] = useState<{ product: ApiProduct; quantity: number }[]>([]);
  const supplySubmitting = useRef(false);
  useEffect(() => {
    setSupplyCart([]);
    setSupplyQuantity("1");
    setSupplyRemarks("");
    setSupplySheetVisible(false);
  }, [employeeId]);
  const [supplyRemarks, setSupplyRemarks] = useState("");
  const [supplying, setSupplying] = useState(false);
  const [salesLoading, setSalesLoading] = useState(true);
  const [salesError, setSalesError] = useState(false);
  const [loadingMoreSales, setLoadingMoreSales] = useState(false);
  const [selectedSale, setSelectedSale] = useState<ApiSale | null>(null);
  const [printPeriodVisible, setPrintPeriodVisible] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const supplyProductsRequestId = useRef(0);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      if (!employeeId && !isSelfProfile) throw new Error("Employee profile is not available");
      const response = isSelfProfile ? await employeesService.myProfile() : await employeesService.profile(employeeId);
      setProfile(response);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [employeeId, isSelfProfile]);

  const loadSales = useCallback(async (page = 1, showSpinner = true) => {
    if (showSpinner) setSalesLoading(true);
    if (page > 1) setLoadingMoreSales(true);
    setSalesError(false);
    try {
      if (!employeeId && !isSelfProfile) throw new Error("Employee profile is not available");
      const trimmedSalesQuery = salesQuery.trim();
      const dateRange = dayRangeFromSearch(trimmedSalesQuery);
      const params = {
        page,
        basis: dateRange ? "invoices" : "collections",
        limit: 10,
        search: dateRange ? undefined : trimmedSalesQuery || undefined,
        startDate: dateRange?.startDate,
        endDate: dateRange?.endDate,
        sortBy: "saleDate",
        sortOrder: "desc"
      } as const;
      const response = isSelfProfile ? await employeesService.mySales(params) : await employeesService.sales(employeeId, params);
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
  }, [employeeId, isSelfProfile, salesQuery]);

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

  useEffect(() => dashboardEvents.subscribe(() => {
    void load();
    void loadSales(1, false);
  }), [load, loadSales]);

  useEffect(() => {
    if (!selectedSale) return;
    requestAnimationFrame(() => saleSheetRef.current?.snapToIndex(0));
  }, [selectedSale]);

  const loadSupplyProducts = useCallback(async (searchTerm = "") => {
    const requestId = supplyProductsRequestId.current + 1;
    supplyProductsRequestId.current = requestId;
    setSupplyProductsLoading(true);
    try {
      const response = await productsService.list({
        page: 1,
        limit: 100,
        search: searchTerm.trim() || undefined,
        available: true,
        sortBy: "name",
        sortOrder: "asc"
      });
      if (requestId !== supplyProductsRequestId.current) return;
      setSupplyProducts(response.data);
      setSelectedSupplyProductId((current) => response.data.some((product) => product.id === current) ? current : response.data[0]?.id ?? null);
    } catch (supplyError) {
      if (requestId !== supplyProductsRequestId.current) return;
      const message = supplyError instanceof Error ? supplyError.message : "Unable to load products for supply.";
      Alert.alert("Unable to load products", message);
    } finally {
      if (requestId === supplyProductsRequestId.current) setSupplyProductsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!supplySheetVisible) return;
    const timer = setTimeout(() => {
      void loadSupplyProducts(supplyProductSearch);
    }, 300);
    return () => clearTimeout(timer);
  }, [loadSupplyProducts, supplyProductSearch, supplySheetVisible]);

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
    if (isSelfProfile) return;
    setSupplyReview(false);
    setSupplySheetVisible(true);
    setSupplyProductSearch("");
  };

  const selectedSupplyItem = () => {
    const product = supplyProducts.find((item) => item.id === selectedSupplyProductId);
    if (!product) throw new Error("Choose a product to supply to this employee.");
    const quantity = Number(supplyQuantity);
    if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error("Enter a whole quantity of at least 1.");
    if (quantity > (product.inventory?.quantityAvailable ?? 0)) throw new Error("Quantity exceeds available stock.");
    return { product, quantity };
  };

  const addToSupplyCart = () => {
    try {
      const item = selectedSupplyItem();
      setSupplyCart((current) => [...current.filter((entry) => entry.product.id !== item.product.id), item]);
      Keyboard.dismiss();
    } catch (error) {
      Alert.alert("Check supply", error instanceof Error ? error.message : "Invalid quantity.");
    }
  };

  const submitSupply = async () => {
    if (!profile || supplySubmitting.current || isSelfProfile) return;
    let items: { product: ApiProduct; quantity: number }[];
    try {
      items = supplyCart.length ? supplyCart : [selectedSupplyItem()];
    } catch (error) {
      Alert.alert("Check supply", error instanceof Error ? error.message : "Invalid quantity.");
      return;
    }
    const targetName = employeeName(profile.employee);
    supplySubmitting.current = true;
    Keyboard.dismiss();
    setSupplying(true);
    try {
      await goodsDisbursementService.create({
        employeeId: profile.employee.id,
        destination: targetName,
        remarks: supplyRemarks.trim() || `Supplied to ${targetName} (${profile.employee.employeeCode})`,
        items: items.map(({ product, quantity }) => ({ productId: product.id, quantity }))
      });
      setSupplySheetVisible(false);
      setSelectedSupplyProductId(null);
      setSupplyProducts([]);
      setSupplyProductSearch("");
      setSupplyQuantity("1");
      setSupplyRemarks("");
      setSupplyCart([]);
      setActiveTab("stock");
      await load();
      Alert.alert("Supply recorded", `${items.map(({ product, quantity }) => `${product.name} ? ${quantity}`).join(", ")} supplied to ${targetName}.`);
    } catch (supplyError) {
      const message = supplyError instanceof Error ? supplyError.message : "Unable to supply product.";
      Alert.alert("Supply failed", message);
    } finally {
      supplySubmitting.current = false;
      setSupplying(false);
    }
  };

  const printSalesRecordForPeriod = useCallback(async (period: "daily" | "weekly" | "monthly") => {
    if (!profile) return;
    setPrintPeriodVisible(false);
    try {
      const now = new Date();
      const startDate = new Date(now);
      const endDate = new Date(now);
      endDate.setHours(23, 59, 59, 999);

      if (period === "daily") {
        startDate.setHours(0, 0, 0, 0);
      } else if (period === "weekly") {
        startDate.setDate(endDate.getDate() - 6);
        startDate.setHours(0, 0, 0, 0);
      } else {
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);
      }

      const params = {
        search: salesQuery.trim() || undefined,
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        sortBy: "saleDate",
        sortOrder: "desc"
      } as const;
      const response = isSelfProfile ? await employeesService.printMySales(params) : await employeesService.printSales(profile.employee.id, params);
      await printingService.printText(response.text);
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : "Unable to print sales record.";
      Alert.alert("Unable to print", message);
    }
  }, [isSelfProfile, profile, salesQuery]);

  const printSalesRecord = () => {
    if (!profile) return;
    setPrintPeriodVisible(true);
  };

  const printReceipt = async () => {
    if (!selectedSale) return;
    try {
      if (selectedSale.receipt?.id) {
        const response = await salesService.printReceipt(selectedSale.receipt.id);
        await printingService.printText(response.text);
        return;
      }

      const receipt = await salesService.receipt(selectedSale.id);
      await printingService.print(mapReceiptToDocument(receipt));
    } catch (printError) {
      const message = printError instanceof Error ? printError.message : "Unable to print receipt.";
      Alert.alert("Unable to print", message);
    }
  };

  const selectedReceiptDocument = async () => {
    if (!selectedSale) return null;
    const receipt = await salesService.receipt(selectedSale.id);
    return mapReceiptToDocument(receipt);
  };

  const saveReceiptPdf = async () => {
    try {
      const receipt = await selectedReceiptDocument();
      if (!receipt) return;
      await printingService.savePdf(receipt);
    } catch (pdfError) {
      const message = pdfError instanceof Error ? pdfError.message : "Unable to save receipt PDF.";
      Alert.alert("PDF failed", message);
    }
  };

  const shareReceiptWhatsApp = async () => {
    try {
      const receipt = await selectedReceiptDocument();
      if (!receipt) return;
      await printingService.sharePdfToWhatsApp(receipt);
    } catch (shareError) {
      const message = shareError instanceof Error ? shareError.message : "Unable to share receipt PDF.";
      Alert.alert("Share failed", message);
    }
  };

  const activity = profile?.profileActivity;
  const stockItems = activity?.stock ?? [];
  const supplyRuns = activity?.supplies.data ?? [];
  const textMatches = useCallback((needle: string, values: Array<string | number | null | undefined>) => {
    const normalized = needle.trim().toLowerCase();
    if (!normalized) return true;
    return values.some((value) => String(value ?? "").toLowerCase().includes(normalized));
  }, []);
  const filteredStockItems = useMemo(() => (
    stockItems.filter((item) => textMatches(stockQuery, [
      item.productName,
      item.sku,
      item.barcode,
      item.productId,
      item.quantityInHand,
      item.suppliedQuantity,
      item.quantitySold
    ]))
  ), [stockItems, stockQuery, textMatches]);
  const filteredSupplyRuns = useMemo(() => (
    supplyRuns.filter((run) => textMatches(suppliesQuery, [
      run.disbursementNumber,
      run.destination,
      run.remarks,
      run.totalQuantity,
      run.totalValue,
      ...run.items.flatMap((item) => [
        item.productName,
        item.sku,
        item.barcode,
        item.productId,
        item.quantity,
        item.value
      ])
    ]))
  ), [suppliesQuery, supplyRuns, textMatches]);

  if (loading) return <LoadingState label="Loading employee" />;
  if (error || !profile) return <ErrorState onRetry={load} />;

  const employee = profile.employee;
  const name = employeeName(employee);
  const role = employee.user.role?.name ?? employee.designation ?? "Employee";
  const latestSession = profile.recentSessions[0];
  const displayStatus = employee.canLogin ? employee.status : "DISABLED";
  const normalizedUserRole = user?.roleName?.trim().toLowerCase();
  const isOwner = normalizedUserRole ? normalizedUserRole === "owner" : user?.role === "owner";
  const canManageStockProducts = !isSelfProfile && (isOwner || canManageProducts);
  const salesToday = activity?.stats.salesToday ?? 0;
  const totalSupplied = activity?.stats.totalSupplied ?? 0;
  const supplyCartCount = supplyCart.reduce((sum, item) => sum + item.quantity, 0);
  const supplyCartTotal = supplyCart.reduce((sum, item) => sum + item.quantity * Number(item.product.purchasePrice ?? 0), 0);
  const supplyReviewActionPadding = supplyReview ? 112 : 0;
  const supplyScrollPadding = Math.max(insets.bottom, 24) + 120 + supplyKeyboardHeight + supplyReviewActionPadding;

  const renderTabContent = () => {
    if (activeTab === "stock") {
      return (
        <View style={styles.tabContent}>
          <SearchBar value={stockQuery} onChangeText={setStockQuery} placeholder="Search employee stock" />
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
          {filteredStockItems.length ? filteredStockItems.map((item) => (
            <Pressable
              key={item.productId}
              disabled={!canManageStockProducts}
              onPress={() => openProductActions(item)}
              accessibilityRole={canManageStockProducts ? "button" : undefined}
              accessibilityLabel={canManageStockProducts ? `Manage ${item.productName}` : undefined}
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
            <EmptyState icon={<Package size={28} color={colors.textPlaceholder} />} title={stockQuery.trim() ? "No stock products found" : "No stock activity yet"} />
          )}
        </View>
      );
    }

    if (activeTab === "supplies") {
      return (
        <View style={styles.tabContent}>
          <SearchBar value={suppliesQuery} onChangeText={setSuppliesQuery} placeholder="Search employee supplies" />
          <Card style={styles.supplySummary}>
            <InfoLine label="Total Supply Run" value={String(activity?.supplies.summary.totalSupplyRuns ?? 0)} />
            <InfoLine label="Total Value Supplied" value={formatCurrency(Number(activity?.supplies.summary.totalSuppliedValue ?? 0))} valueColor={colors.primary} />
          </Card>
          {filteredSupplyRuns.length ? filteredSupplyRuns.map((run) => {
            const expanded = expandedSupplyRunId === run.id;
            const productTitle = supplyRunProductTitle(run);
            return (
              <Pressable
                key={run.id}
                onPress={() => setExpandedSupplyRunId((current) => current === run.id ? null : run.id)}
                accessibilityRole="button"
                accessibilityLabel={`View supplied products in ${productTitle}`}
              >
                <Card style={styles.supplyCard}>
                  <View style={styles.productHead}>
                    <View style={styles.supplyIcon}><Archive size={16} color={colors.primary} /></View>
                    <View style={styles.productBody}>
                      <Text style={styles.productTitle}>{productTitle}</Text>
                      <Text style={styles.productMeta}>{run.destination ?? "No destination"} | {compactDate(run.disbursementDate)}</Text>
                    </View>
                    <Text style={styles.quantity}>{run.totalQuantity}</Text>
                  </View>
                  <Text style={styles.productMeta}>{formatCurrency(Number(run.totalValue))} supplied value</Text>
                  {expanded ? (
                    <View style={styles.supplyItems}>
                      {run.items.map((item) => {
                        const unitValue = item.quantity > 0 ? Number(item.value) / item.quantity : 0;
                        return (
                          <View key={item.id} style={styles.productRow}>
                            <View style={styles.saleBody}>
                              <Text style={styles.item}>{item.productName}</Text>
                              <Text style={styles.label}>{item.sku ?? item.barcode ?? item.productId.slice(0, 8)} | Qty {item.quantity} x {formatCurrency(unitValue)}</Text>
                            </View>
                            <Text style={styles.item}>{formatCurrency(Number(item.value))}</Text>
                          </View>
                        );
                      })}
                    </View>
                  ) : null}
                </Card>
              </Pressable>
            );
          }) : (
            <EmptyState icon={<Archive size={28} color={colors.textPlaceholder} />} title={suppliesQuery.trim() ? "No supply records found" : "No supply records yet"} />
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
          <SearchBar value={salesQuery} onChangeText={setSalesQuery} placeholder="Search sales or date e.g. 15/09/2026" />
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
                    <Text style={styles.label}>{compactDate(sale.collectionDate ?? sale.saleDate)} | {salePaymentMethod(sale)}</Text>
                  </View>
                  <View style={styles.saleRight}>
                    <Text style={styles.item}>{formatCurrency(Number(sale.collectedAmount ?? sale.totalAmount))}</Text>
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
        right={!isSelfProfile ? (
          <Pressable style={styles.supplyButton} onPress={() => void openSupplySheet()} accessibilityRole="button" accessibilityLabel={`Supply products to ${name}`} hitSlop={8}>
            <PackagePlus size={14} color={colors.surface} />
            <Text style={styles.supplyButtonText}>Supply</Text>
          </Pressable>
        ) : undefined}
      />
      <ScrollView
        style={styles.scroller}
        contentContainerStyle={[styles.scrollContent, { paddingBottom: spacing.bottomNavHeight + Math.max(insets.bottom, 32) + 64 }]}
        showsVerticalScrollIndicator
        persistentScrollbar
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
        <AppBottomSheet ref={saleSheetRef} snapPoints={["82%"]} initialIndex={0} onClose={() => setSelectedSale(null)}>
          <BottomSheetScrollView
            contentContainerStyle={[styles.sheetContent, { paddingBottom: Math.max(insets.bottom, 24) + 48 }]}
            showsVerticalScrollIndicator
            persistentScrollbar
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
            nestedScrollEnabled
          >
            <View style={styles.sectionHeader}>
              <View>
                <Text style={styles.sectionTitle}>{selectedSale.saleNumber}</Text>
                <Text style={styles.sectionMeta}>{new Date(selectedSale.saleDate).toLocaleString()}</Text>
              </View>
              <View style={styles.receiptActions}>
                <Button label="PDF" variant="ghost" icon={<FileDown size={16} color={colors.primary} />} onPress={() => void saveReceiptPdf()} style={styles.smallButton} />
                <Button label="WhatsApp" variant="ghost" icon={<Send size={16} color={colors.primary} />} onPress={() => void shareReceiptWhatsApp()} style={styles.smallButton} />
                <Button label="Receipt" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={() => void printReceipt()} style={styles.smallButton} />
              </View>
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
          </BottomSheetScrollView>
        </AppBottomSheet>
      ) : null}

      <Modal
        transparent
        animationType="fade"
        statusBarTranslucent
        visible={printPeriodVisible}
        onRequestClose={() => setPrintPeriodVisible(false)}
      >
        <View style={styles.printModal}>
          <Pressable
            style={StyleSheet.absoluteFillObject}
            accessibilityRole="button"
            accessibilityLabel="Close print sales record options"
            onPress={() => setPrintPeriodVisible(false)}
          />
          <View style={styles.printDialog}>
            <Text style={styles.printTitle}>Print Sales Record</Text>
            <Text style={styles.printMessage}>Choose the sales period to print.</Text>
            <View style={styles.printActions}>
              <Pressable style={styles.printAction} onPress={() => void printSalesRecordForPeriod("daily")} accessibilityRole="button" accessibilityLabel="Print daily sales record">
                <Text style={styles.printActionText}>Daily</Text>
              </Pressable>
              <Pressable style={styles.printAction} onPress={() => void printSalesRecordForPeriod("weekly")} accessibilityRole="button" accessibilityLabel="Print weekly sales record">
                <Text style={styles.printActionText}>Weekly</Text>
              </Pressable>
              <Pressable style={styles.printAction} onPress={() => void printSalesRecordForPeriod("monthly")} accessibilityRole="button" accessibilityLabel="Print monthly sales record">
                <Text style={styles.printActionText}>Monthly</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {!isSelfProfile && supplySheetVisible ? (
        <Modal transparent animationType="slide" statusBarTranslucent visible onRequestClose={() => { Keyboard.dismiss(); setSupplySheetVisible(false); }}>
          <View style={styles.supplyModal}>
            <Pressable style={StyleSheet.absoluteFillObject} accessibilityLabel="Close supply" onPress={() => { Keyboard.dismiss(); setSupplySheetVisible(false); }} />
            <View style={[styles.supplyModalSheet, { height: supplyKeyboardHeight ? "94%" : "82%" }]}>
              <View style={styles.supplyHandle} />
              <ScrollView
                ref={supplyScrollRef}
                style={styles.supplySheetScroller}
                scrollEnabled
                overScrollMode="always"
                keyboardDismissMode="on-drag"
                contentContainerStyle={[styles.sheetContent, { paddingBottom: supplyScrollPadding }]}
                showsVerticalScrollIndicator
                persistentScrollbar
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
              >
                <View>
                  <Text style={styles.sectionTitle}>{supplyReview ? "Complete supply" : "Supply Products"}</Text>
                  <Text style={styles.sectionMeta}>{name}</Text>
                </View>
                {!supplyReview ? (
                  <>
                    <SearchBar value={supplyProductSearch} onChangeText={setSupplyProductSearch} placeholder="Search products" />
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
                              onPress={() => {
                                setSelectedSupplyProductId(product.id);
                                setSupplyQuantity(String(supplyCart.find((item) => item.product.id === product.id)?.quantity ?? 1));
                              }}
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
                      <EmptyState icon={<Package size={28} color={colors.textPlaceholder} />} title={supplyProductSearch.trim() ? "No products found" : "No available products"} />
                    )}
                    <View style={styles.formGroup}>
                      <Text style={styles.infoLabel}>Quantity</Text>
                      <TextInput
                        editable={!supplying}
                        value={supplyQuantity}
                        onChangeText={setSupplyQuantity}
                        keyboardType="number-pad"
                        style={styles.textInput}
                        placeholder="1"
                        placeholderTextColor={colors.textPlaceholder}
                        accessibilityLabel="Supply quantity"
                        onFocus={() => setTimeout(() => supplyScrollRef.current?.scrollToEnd({ animated: true }), 250)}
                      />
                    </View>
                    <Button
                      label={supplyCart.some((item) => item.product.id === selectedSupplyProductId) ? "Update cart" : "Add to cart"}
                      variant="ghost"
                      disabled={supplying || supplyProductsLoading || !selectedSupplyProductId}
                      onPress={addToSupplyCart}
                    />
                  </>
                ) : (
                  <>
                    {supplyCart.map(({ product, quantity }) => (
                      <Card key={product.id} style={styles.supplyCartRow}>
                        <View style={styles.cartBody}>
                          <Text style={styles.supplyCartName}>{product.name}</Text>
                          <Text style={styles.supplyCartMeta}>{quantity} x {formatCurrency(Number(product.purchasePrice ?? 0))}</Text>
                        </View>
                        <Text style={styles.supplyCartValue}>{formatCurrency(quantity * Number(product.purchasePrice ?? 0))}</Text>
                        <Pressable
                          style={styles.removeCartItemButton}
                          accessibilityRole="button"
                          accessibilityLabel={`Remove ${product.name}`}
                          disabled={supplying}
                          onPress={() => setSupplyCart((current) => current.filter((item) => item.product.id !== product.id))}
                          hitSlop={12}
                        >
                          <Trash2 size={16} color={colors.error} />
                        </Pressable>
                      </Card>
                    ))}
                    <Card style={styles.supplyTotalCard}>
                      <View style={styles.totalLine}>
                        <Text style={styles.label}>Items</Text>
                        <Text style={styles.supplyCartValue}>{supplyCartCount}</Text>
                      </View>
                      <View style={styles.totalLine}>
                        <Text style={styles.sectionTitle}>Total</Text>
                        <Text style={styles.supplyCartTotal}>{formatCurrency(supplyCartTotal)}</Text>
                      </View>
                    </Card>
                    <View style={styles.formGroup}>
                      <Text style={styles.infoLabel}>Remarks</Text>
                      <TextInput
                        editable={!supplying}
                        onFocus={() => setTimeout(() => supplyScrollRef.current?.scrollToEnd({ animated: true }), 250)}
                        value={supplyRemarks}
                        onChangeText={setSupplyRemarks}
                        style={[styles.textInput, styles.remarksInput]}
                        placeholder="Optional"
                        placeholderTextColor={colors.textPlaceholder}
                        multiline
                        accessibilityLabel="Supply remarks"
                      />
                    </View>
                    <Button label="Add More Products" variant="ghost" disabled={supplying} onPress={() => setSupplyReview(false)} />
                    <Button
                      label="Clear Cart"
                      variant="danger"
                      icon={<Trash2 size={16} color={colors.error} />}
                      disabled={supplying}
                      onPress={() => { setSupplyCart([]); setSupplyReview(false); }}
                    />
                  </>
                )}
              </ScrollView>
              {!supplyReview && supplyCart.length > 0 ? (
                <Pressable
                  style={[styles.supplyCartFab, { bottom: Math.max(insets.bottom, 16) }]}
                  accessibilityRole="button"
                  accessibilityLabel="Open supply cart"
                  onPress={() => {
                    Keyboard.dismiss();
                    setSupplyReview(true);
                    supplyScrollRef.current?.scrollTo({ y: 0, animated: false });
                  }}
                >
                  <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.supplyCartGradient}>
                    <Wallet size={18} color={colors.surface} />
                    <Text style={styles.supplyCartText}>{supplyCartCount} items</Text>
                    <Text style={styles.supplyCartTextTotal}>{formatCurrency(supplyCartTotal)}</Text>
                  </LinearGradient>
                </Pressable>
              ) : null}
              {supplyReview ? (
                <View style={[styles.supplyStickyActions, { paddingBottom: Math.max(insets.bottom, 16) }]}>
                  <Button label="Record Supply" loading={supplying} disabled={supplying || supplyCart.length === 0} onPress={() => void submitSupply()} />
                </View>
              ) : null}
            </View>
          </View>
        </Modal>
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
  printModal: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28, backgroundColor: "rgba(15, 23, 42, 0.55)" },
  printDialog: { width: "100%", borderRadius: 12, backgroundColor: colors.surface, padding: 22, gap: 12, elevation: 8 },
  printTitle: { color: colors.foreground, fontSize: 20, fontWeight: "900" },
  printMessage: { color: colors.textSecondary, fontSize: 15, lineHeight: 22 },
  printActions: { flexDirection: "row", justifyContent: "space-between", gap: 8, marginTop: 14 },
  printAction: { minHeight: 44, minWidth: 80, borderRadius: 10, alignItems: "center", justifyContent: "center", paddingHorizontal: 10 },
  printActionText: { color: colors.primary, fontSize: 13, fontWeight: "900", textTransform: "uppercase", letterSpacing: 0.8 },
  supplyModal: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 23, 42, 0.45)" },
  supplyModalSheet: { backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingTop: 12, overflow: "hidden" },
  supplyHandle: { alignSelf: "center", width: 32, height: 4, borderRadius: 999, backgroundColor: colors.borderLight },
  supplySheetScroller: { flex: 1 },
  supplyStickyActions: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 10,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.borderLighter,
  },
  supplyCartFab: { position: "absolute", left: 16, right: 16, borderRadius: 18, overflow: "hidden", elevation: 30 },
  supplyCartGradient: { height: 56, borderRadius: 18, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, gap: 10 },
  supplyCartText: { color: colors.surface, fontSize: 14, fontWeight: "800", flex: 1 },
  supplyCartTextTotal: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  supplyCartRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cartBody: { flex: 1 },
  removeCartItemButton: { width: 34, height: 34, alignItems: "center", justifyContent: "center" },
  supplyCartName: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  supplyCartMeta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  supplyCartValue: { color: colors.foreground, fontSize: 13, fontWeight: "800" },
  supplyCartTotal: { color: colors.primary, fontSize: 15, fontWeight: "900" },
  supplyTotalCard: { gap: 8 },
  totalLine: { minHeight: 28, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
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
  receiptActions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "flex-end", gap: 8, flexShrink: 1 },
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
  supplyItems: { gap: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.borderLighter, paddingTop: 8 },
  formGroup: { gap: 6 },
  textInput: { minHeight: 48, borderWidth: 1, borderColor: colors.borderLight, borderRadius: 8, paddingHorizontal: 12, color: colors.foreground, backgroundColor: colors.inputBg },
  remarksInput: { minHeight: 76, paddingTop: 12, textAlignVertical: "top" }
});
