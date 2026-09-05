import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, FlatList, Pressable, ScrollView, StyleSheet, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import BottomSheet from "@gorhom/bottom-sheet";
import { CreditCard, Grid2X2, HandCoins, List, Minus, Package, Plus, Printer, Search, Wallet } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { AppBottomSheet, Button, Card } from "@/components/common";
import { AppApiError } from "@/api/errors";
import { ReceiptTicket } from "@/components/receipt";
import { creditSalesService } from "@/services/credit-sales.service";
import { customersService } from "@/services/customers.service";
import { offlineSyncService } from "@/services/offline-sync.service";
import { printingService } from "@/services/printing.service";
import { productsService } from "@/services/products.service";
import { salesService } from "@/services/sales.service";
import { useAuthStore } from "@/store/authStore";
import { useCartStore } from "@/store/cartStore";
import { useEmployeeCartStore } from "@/store/employeeCartStore";
import { colors, shadows, spacing } from "@/theme";
import type { EmployeeStockItem, Product, ReceiptDocument, SaleItem } from "@/types/domain.types";
import type { ApiCustomer } from "@/types/customer";
import type { ApiCreditSale } from "@/types/creditSale";
import { customerDisplayName } from "@/types/customer";
import { mapApiProductToDomain } from "@/types/product";
import type { CreatePaymentPayload, CreateSalePayload, PosPaymentMethod } from "@/types/sales";
import { mapReceiptToDocument, toApiPaymentMethod } from "@/types/sales";
import { formatCurrency } from "@/utils/format";

const paymentMethods: Array<{ label: string; value: PosPaymentMethod }> = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank", value: "bank" },
  { label: "Mobile", value: "mobile" },
  { label: "Credit", value: "credit" }
];

const collectMethods: Array<{ label: string; value: Exclude<PosPaymentMethod, "credit"> }> = [
  { label: "Cash", value: "cash" },
  { label: "Card", value: "card" },
  { label: "Bank", value: "bank" },
  { label: "Mobile", value: "mobile" }
];

type ProductTile = {
  id: string;
  name: string;
  sku: string;
  category: string;
  price: number;
  stock: number;
  iconColor: string;
  floorPrice?: number;
  source: Product | EmployeeStockItem;
};

type CreditInvoiceView = {
  id: string;
  customerName: string;
  orderNumber: string;
  remaining: number;
  items: SaleItem[];
};

const alphaColor = (hex: string, opacity: number) => {
  const clean = hex.replace("#", "");
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${opacity})`;
};

const stockStatus = (stock: number) => {
  if (stock <= 3) return { label: "Critical", color: colors.error, bg: colors.errorBg };
  if (stock <= 10) return { label: "Low", color: colors.warning, bg: colors.warningBg };
  return { label: "In Stock", color: colors.successDark, bg: colors.successBg };
};

export function AddNewSalesScreen({ navigation }: { navigation: any }) {
  const insets = useSafeAreaInsets();
  const user = useAuthStore((state) => state.user);
  const normalizedRoleName = user?.roleName?.trim().toLowerCase();
  const role = normalizedRoleName ? (normalizedRoleName === "owner" ? "owner" : "employee") : user?.role ?? "owner";
  const [grid, setGrid] = useState(true);
  const [query, setQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState("All");
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [quantityInputs, setQuantityInputs] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("cash");
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | undefined>();
  const [selectedCollectInvoice, setSelectedCollectInvoice] = useState<CreditInvoiceView | null>(null);
  const [collectAmount, setCollectAmount] = useState("");
  const [collectMethod, setCollectMethod] = useState<Exclude<PosPaymentMethod, "credit">>("cash");
  const [activeReceipt, setActiveReceipt] = useState<ReceiptDocument | null>(null);
  const [printText, setPrintText] = useState<string | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [customers, setCustomers] = useState<ApiCustomer[]>([]);
  const [creditInvoices, setCreditInvoices] = useState<CreditInvoiceView[]>([]);
  const [loadingProducts, setLoadingProducts] = useState(true);
  const [loadingCreditInvoices, setLoadingCreditInvoices] = useState(false);
  const [processingSale, setProcessingSale] = useState(false);
  const [collectingPayment, setCollectingPayment] = useState(false);
  const [checkoutVisible, setCheckoutVisible] = useState(false);
  const [collectVisible, setCollectVisible] = useState(false);
  const [receiptVisible, setReceiptVisible] = useState(false);
  const [discountInput, setDiscountInput] = useState("0");
  const [taxInput, setTaxInput] = useState("0");
  const [paidInput, setPaidInput] = useState("");
  const [referenceInput, setReferenceInput] = useState("");
  const checkoutRef = useRef<BottomSheet>(null);
  const collectRef = useRef<BottomSheet>(null);
  const receiptRef = useRef<BottomSheet>(null);
  const ownerCart = useCartStore();
  const employeeCart = useEmployeeCartStore();
  const loadProducts = useCallback(async () => {
    setLoadingProducts(true);
    try {
      const response = await productsService.list({ limit: 100, available: true });
      setProducts(response.data.map(mapApiProductToDomain));
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load products.";
      Alert.alert("Products", message);
    } finally {
      setLoadingProducts(false);
    }
  }, []);

  const loadCustomers = useCallback(async () => {
    try {
      const response = await customersService.list({ limit: 100, isActive: true });
      setCustomers(response.data);
    } catch (loadError) {
      const message = loadError instanceof Error ? loadError.message : "Unable to load customers.";
      Alert.alert("Customers", message);
    }
  }, []);

  const loadCreditInvoices = useCallback(async () => {
    setLoadingCreditInvoices(true);
    try {
      const response = await creditSalesService.posOutstanding({ limit: 50 });
      const rows = response.data.map((item: ApiCreditSale): CreditInvoiceView => ({
        id: item.id,
        customerName: item.customer.name || "Customer",
        orderNumber: item.sale.saleNumber ?? item.id.slice(0, 8),
        remaining: Number(item.balance ?? 0),
        items: item.sale.items.map((saleItem) => ({
          productId: saleItem.productId,
          name: saleItem.productName ?? "Product",
          qty: saleItem.quantity,
          price: Number(saleItem.unitPrice ?? 0)
        }))
      }));
      setCreditInvoices(rows);
      return rows;
    } catch (error) {
      setCreditInvoices([]);
      throw error;
    } finally {
      setLoadingCreditInvoices(false);
    }
  }, []);

  useEffect(() => {
    void loadProducts();
    void loadCustomers();
    void loadCreditInvoices().catch(() => undefined);
  }, [loadCreditInvoices, loadCustomers, loadProducts]);

  const productTiles: ProductTile[] = useMemo(() => {
    if (role === "owner") {
      return products.map((product) => ({
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: Number(prices[product.id] ?? product.price),
        stock: product.stock,
        iconColor: product.iconColor,
        floorPrice: product.floorPrice,
        source: product
      }));
    }

    return products.map((product) => {
      const stockItem: EmployeeStockItem = {
        productId: product.id,
        name: product.name,
        qtyInHand: product.stock,
        floorPrice: product.floorPrice ?? product.cost,
        iconColor: product.iconColor
      };
      return {
        id: product.id,
        name: product.name,
        sku: product.sku,
        category: product.category,
        price: Number(prices[product.id] ?? product.price),
        stock: product.stock,
        iconColor: product.iconColor,
        floorPrice: product.floorPrice,
        source: stockItem
      };
    });
  }, [prices, products, role]);

  const categories = useMemo(() => ["All", ...Array.from(new Set(productTiles.map((product) => product.category)))], [productTiles]);
  const filteredProducts = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return productTiles.filter((product) => {
      const inCategory = activeCategory === "All" || product.category === activeCategory;
      const matchesQuery = !normalized || [product.name, product.sku, product.category].some((value) => value.toLowerCase().includes(normalized));
      return inCategory && matchesQuery;
    });
  }, [activeCategory, productTiles, query]);

  const cartCount = role === "owner" ? ownerCart.items.reduce((sum, item) => sum + item.qty, 0) : employeeCart.items.reduce((sum, item) => sum + item.qty, 0);
  const cartSubtotal = role === "owner" ? ownerCart.total : employeeCart.total;
  const discountAmount = Math.max(0, Number(discountInput || 0));
  const taxAmount = Math.max(0, Number(taxInput || 0));
  const grandTotal = Math.max(0, cartSubtotal - discountAmount + taxAmount);
  const paidAmount = paidInput.trim() === "" ? (paymentMethod === "credit" ? 0 : grandTotal) : Math.max(0, Number(paidInput || 0));
  const total = grandTotal;
  const selectedCustomer = customers.find((customer) => customer.id === selectedCustomerId);
  const openCreditInvoices = useMemo(() => creditInvoices.filter((invoice) => invoice.remaining > 0), [creditInvoices]);
  const cartItems: SaleItem[] = role === "owner"
    ? ownerCart.items.map((item) => ({ productId: item.product.id, name: item.product.name, qty: item.qty, price: item.product.price }))
    : employeeCart.items.map((item) => ({ productId: item.stockItem.productId, name: item.stockItem.name, qty: item.qty, price: item.sellingPrice }));

  const cartQty = (productId: string) => role === "owner"
    ? ownerCart.items.find((item) => item.product.id === productId)?.qty ?? 0
    : employeeCart.items.find((item) => item.stockItem.productId === productId)?.qty ?? 0;

  const productPriceInput = (product: ProductTile) => prices[product.id] ?? String(product.price || "");

  const parsePositiveMoney = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed || !/^\d+(\.\d{0,2})?$/.test(trimmed)) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  };

  const openReceipt = (receipt: ReceiptDocument) => {
    setActiveReceipt(receipt);
    setReceiptVisible(true);
    requestAnimationFrame(() => receiptRef.current?.snapToIndex(0));
  };

  const openCheckout = () => {
    setCheckoutVisible(true);
    requestAnimationFrame(() => checkoutRef.current?.snapToIndex(0));
  };

  const openCollectSheet = () => {
    setCollectVisible(true);
    requestAnimationFrame(() => collectRef.current?.snapToIndex(0));
  };

  const distributeAmount = (amount: number, lineSubtotal: number) => {
    if (cartSubtotal <= 0 || amount <= 0) return 0;
    return Number(((lineSubtotal / cartSubtotal) * amount).toFixed(2));
  };

  const addProduct = (product: ProductTile) => {
    const currentQty = cartQty(product.id);
    if (currentQty >= product.stock) {
      Alert.alert("Stock limit", "You cannot add more than the available stock.");
      return;
    }

    const sellingPrice = parsePositiveMoney(productPriceInput(product));
    if (!sellingPrice) {
      Alert.alert("Selling price", "Enter the selling price before adding this product.");
      return;
    }

    if (role === "owner") {
      ownerCart.addItem(product.source as Product, sellingPrice);
      setQuantityInputs((current) => ({ ...current, [product.id]: String(currentQty + 1) }));
      return;
    }

    employeeCart.addItem(product.source as EmployeeStockItem, sellingPrice);
    setQuantityInputs((current) => ({ ...current, [product.id]: String(currentQty + 1) }));
  };

  const handleBarcodeLookup = async () => {
    const barcode = query.trim();
    if (!barcode) return;
    try {
      const matches = await productsService.searchByBarcode(barcode);
      if (matches.length === 0) {
        Alert.alert("Barcode", "No product found for this barcode.");
        return;
      }
      const mapped = matches.map(mapApiProductToDomain);
      setProducts((current) => {
        const byId = new Map(current.map((item) => [item.id, item]));
        mapped.forEach((item) => byId.set(item.id, item));
        return Array.from(byId.values());
      });
      const matchedProduct = mapped[0];
      const tile: ProductTile = {
        id: matchedProduct.id,
        name: matchedProduct.name,
        sku: matchedProduct.sku,
        category: matchedProduct.category,
        price: Number(prices[matchedProduct.id] ?? matchedProduct.price),
        stock: matchedProduct.stock,
        iconColor: matchedProduct.iconColor,
        floorPrice: matchedProduct.floorPrice,
        source: role === "owner" ? matchedProduct : {
          productId: matchedProduct.id,
          name: matchedProduct.name,
          qtyInHand: matchedProduct.stock,
          floorPrice: matchedProduct.floorPrice ?? matchedProduct.cost,
          iconColor: matchedProduct.iconColor
        }
      };
      addProduct(tile);
    } catch (barcodeError) {
      const message = barcodeError instanceof Error ? barcodeError.message : "Unable to look up barcode.";
      Alert.alert("Barcode", message);
    }
  };

  const updateProductQty = (product: ProductTile, nextQty: number) => {
    if (nextQty <= 0) {
      if (role === "owner") ownerCart.removeItem(product.id);
      else employeeCart.removeItem(product.id);
      setQuantityInputs((current) => ({ ...current, [product.id]: "0" }));
      return;
    }
    if (nextQty > product.stock) {
      Alert.alert("Stock limit", "You cannot add more than the available stock.");
      return;
    }
    if (role === "owner") ownerCart.updateQty(product.id, nextQty);
    else employeeCart.updateQty(product.id, nextQty);
    setQuantityInputs((current) => ({ ...current, [product.id]: String(nextQty) }));
  };

  const updateProductPrice = (product: ProductTile, value: string) => {
    setPrices((prev) => ({ ...prev, [product.id]: value }));
    const sellingPrice = parsePositiveMoney(value);
    if (!sellingPrice) return;
    if (role === "owner") ownerCart.updateSellingPrice(product.id, sellingPrice);
    else employeeCart.updateSellingPrice(product.id, sellingPrice);
  };

  const submitQuantityInput = (product: ProductTile, value: string) => {
    const trimmed = value.trim();
    if (!trimmed && cartQty(product.id) === 0) {
      return;
    }
    if (!/^\d+$/.test(trimmed)) {
      Alert.alert("Quantity", "Enter a valid quantity.");
      setQuantityInputs((current) => ({ ...current, [product.id]: String(cartQty(product.id)) }));
      return;
    }
    const nextQty = Number(trimmed);
    if (!Number.isSafeInteger(nextQty) || nextQty <= 0) {
      Alert.alert("Quantity", "Enter a valid quantity.");
      setQuantityInputs((current) => ({ ...current, [product.id]: String(cartQty(product.id)) }));
      return;
    }
    updateProductQty(product, nextQty);
  };

  const handleCheckout = async () => {
    if (cartItems.length === 0) return;
    if (Number.isNaN(discountAmount) || Number.isNaN(taxAmount) || Number.isNaN(paidAmount)) {
      Alert.alert("Check amounts", "Discount, tax and paid amount must be valid numbers.");
      return;
    }
    if (discountAmount > cartSubtotal) {
      Alert.alert("Check discount", "Discount cannot exceed the subtotal.");
      return;
    }
    const creditBalance = paymentMethod === "credit" ? grandTotal : Math.max(0, grandTotal - paidAmount);
    if (creditBalance > 0 && !selectedCustomer) {
      Alert.alert("Select customer", "Credit and partial payment sales must be assigned to a customer.");
      return;
    }
    if (paymentMethod !== "credit" && paidAmount <= 0) {
      Alert.alert("Payment amount", "Paid amount must be greater than zero.");
      return;
    }

    setProcessingSale(true);
    try {
      const saleItems = cartItems.map((item) => {
        const lineSubtotal = item.qty * item.price;
        return {
          productId: item.productId,
          quantity: item.qty,
          unitPrice: item.price,
          discountAmount: distributeAmount(discountAmount, lineSubtotal),
          taxAmount: distributeAmount(taxAmount, lineSubtotal)
        };
      });

      const payments: CreatePaymentPayload[] = [];
      if (paymentMethod !== "credit") {
        payments.push({
          paymentMethod: toApiPaymentMethod(paymentMethod),
          amount: paidAmount,
          referenceNumber: referenceInput.trim() || undefined,
          allowChange: paidAmount > grandTotal
        });
      }
      if (creditBalance > 0) {
        payments.push({
          paymentMethod: toApiPaymentMethod("credit"),
          amount: Number(creditBalance.toFixed(2))
        });
      }

      const salePayload: CreateSalePayload = {
        customerId: selectedCustomer?.id,
        items: saleItems,
        payments,
        remarks: paymentMethod === "credit" ? "Credit sale" : undefined
      };

      const clearCheckout = async () => {
        if (role === "owner") ownerCart.clearCart();
        else employeeCart.clearCart();
        setPaidInput("");
        setReferenceInput("");
        setDiscountInput("0");
        setTaxInput("0");
        checkoutRef.current?.close();
        setCheckoutVisible(false);
        await loadCreditInvoices();
      };

      const queueOfflineSale = async () => {
        await offlineSyncService.enqueueSale(salePayload);
        await clearCheckout();
        Alert.alert("Sale queued", "The sale was saved offline and will sync when the network is available.");
      };

      if (!(await offlineSyncService.isOnline())) {
        await queueOfflineSale();
        return;
      }

      const sale = await salesService.create(salePayload);
      const receipt = await salesService.receipt(sale.id);
      const printReady = sale.receipt?.id ? await salesService.printReceipt(sale.receipt.id) : null;
      setPrintText(printReady?.text ?? null);

      await clearCheckout();
      await loadProducts();
      openReceipt(mapReceiptToDocument(receipt));
    } catch (checkoutError) {
      if (checkoutError instanceof AppApiError && (checkoutError.code === "NETWORK" || checkoutError.code === "TIMEOUT")) {
        try {
          const saleItems = cartItems.map((item) => {
            const lineSubtotal = item.qty * item.price;
            return {
              productId: item.productId,
              quantity: item.qty,
              unitPrice: item.price,
              discountAmount: distributeAmount(discountAmount, lineSubtotal),
              taxAmount: distributeAmount(taxAmount, lineSubtotal)
            };
          });
          const payments: CreatePaymentPayload[] = [];
          if (paymentMethod !== "credit") {
            payments.push({
              paymentMethod: toApiPaymentMethod(paymentMethod),
              amount: paidAmount,
              referenceNumber: referenceInput.trim() || undefined,
              allowChange: paidAmount > grandTotal
            });
          }
          if (creditBalance > 0) {
            payments.push({
              paymentMethod: toApiPaymentMethod("credit"),
              amount: Number(creditBalance.toFixed(2))
            });
          }
          await offlineSyncService.enqueueSale({
            customerId: selectedCustomer?.id,
            items: saleItems,
            payments,
            remarks: paymentMethod === "credit" ? "Credit sale" : undefined
          });
          if (role === "owner") ownerCart.clearCart();
          else employeeCart.clearCart();
          setPaidInput("");
          setReferenceInput("");
          setDiscountInput("0");
          setTaxInput("0");
          checkoutRef.current?.close();
          setCheckoutVisible(false);
          Alert.alert("Sale queued", "The sale was saved offline and will sync when the network is available.");
          return;
        } catch {
          Alert.alert("Sale failed", "Unable to save the sale offline.");
          return;
        }
      }
      const message = checkoutError instanceof Error ? checkoutError.message : "Unable to complete sale.";
      Alert.alert("Sale failed", message);
    } finally {
      setProcessingSale(false);
    }
  };

  const openCollect = async () => {
    try {
      const invoices = await loadCreditInvoices();
      const payableInvoices = invoices.filter((invoice) => invoice.remaining > 0);

      if (payableInvoices.length === 0) {
        Alert.alert("No balances", "There are no outstanding credit invoices to collect.");
        return;
      }

      setSelectedCollectInvoice(payableInvoices[0]);
      setCollectAmount(String(payableInvoices[0].remaining));
      openCollectSheet();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load outstanding credit invoices.";
      Alert.alert("Credit payments", message);
    }
  };

  const handleCollectPayment = async () => {
    if (!selectedCollectInvoice || collectingPayment) return;
    const amount = Number(collectAmount);
    if (!amount || amount <= 0 || amount > selectedCollectInvoice.remaining) {
      Alert.alert("Check amount", "Payment must be greater than zero and cannot exceed the invoice balance.");
      return;
    }

    setCollectingPayment(true);
    try {
      await creditSalesService.collectPosPayment(selectedCollectInvoice.id, {
        amount,
        paymentMethod: toApiPaymentMethod(collectMethod),
        referenceNumber: `CR-${Date.now()}`
      });
      collectRef.current?.close();
      setCollectVisible(false);
      setSelectedCollectInvoice(null);
      setCollectAmount("");
      await loadCreditInvoices();
      Alert.alert("Payment received", "Credit payment has been recorded.");
    } catch (collectError) {
      const message = collectError instanceof Error ? collectError.message : "Unable to collect credit payment.";
      Alert.alert("Payment failed", message);
    } finally {
      setCollectingPayment(false);
    }
  };

  const handlePrint = async () => {
    if (!activeReceipt) return;
    if (printText) {
      await printingService.printText(printText);
    } else {
      await printingService.print(activeReceipt);
    }
    setActiveReceipt({ ...activeReceipt, printed: true });
  };

  const handleAddSalePress = () => {
    if (cartCount > 0) {
      openCheckout();
      return;
    }

    if (query.trim()) {
      void handleBarcodeLookup();
      return;
    }

    if (filteredProducts.length === 1) {
      addProduct(filteredProducts[0]);
      return;
    }

    if (products.length === 0) {
      if (role === "owner") {
        Alert.alert("No products", "Create a product before starting a sale.", [
          { text: "Cancel", style: "cancel" },
          { text: "Add Product", onPress: () => {
            const parent = navigation.getParent?.();
            if (parent) parent.navigate("ProductForm");
            else navigation.navigate("ProductForm");
          } }
        ]);
        return;
      }

      Alert.alert("No products", "No products are available for sale.");
      return;
    }

    Alert.alert("Add item", "Tap a product card or search a barcode to add it to the sale.");
  };

  return (
    <View style={styles.screen}>
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 10) + 8 }]}>
        <View style={styles.headerRow}>
          <Text style={styles.title}>Add New Sales</Text>
          <Pressable style={styles.collectButton} onPress={() => void openCollect()} accessibilityRole="button" accessibilityLabel="Collect credit payment">
            <HandCoins size={12} color={colors.orange} />
            <Text style={styles.collectText}>{loadingCreditInvoices ? "Loading" : "Collect"}</Text>
          </Pressable>
          <Pressable onPress={() => setGrid((value) => !value)} accessibilityRole="button" accessibilityLabel="Toggle product layout" style={styles.smallIconButton}>
            {grid ? <List size={16} color={colors.textMuted} /> : <Grid2X2 size={16} color={colors.textMuted} />}
          </Pressable>
          <Pressable onPress={handleAddSalePress} accessibilityRole="button" accessibilityLabel="Add sale item or complete sale" style={styles.addCircle}>
            <Plus size={19} color={colors.surface} strokeWidth={2.8} />
          </Pressable>
        </View>
        <View style={styles.searchBox}>
          <Search size={14} color={colors.textPlaceholder} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            onSubmitEditing={() => void handleBarcodeLookup()}
            placeholder="Search products..."
            placeholderTextColor={colors.textPlaceholder}
            style={styles.searchInput}
            accessibilityLabel="Search products"
          />
        </View>
        <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={styles.filters}>
          {categories.map((category) => {
            const selected = activeCategory === category;
            return (
              <Pressable key={category} onPress={() => setActiveCategory(category)} accessibilityRole="button" accessibilityLabel={`Filter ${category}`}>
                <Text style={[styles.chip, selected && styles.chipActive]}>{category}</Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      <FlatList
        data={filteredProducts}
        ListEmptyComponent={loadingProducts ? <Text style={styles.emptyText}>Loading products...</Text> : <Text style={styles.emptyText}>No products found</Text>}
        keyExtractor={(item) => item.id}
        numColumns={grid ? 2 : 1}
        key={grid ? "grid" : "list"}
        showsVerticalScrollIndicator
        persistentScrollbar
        indicatorStyle="black"
        contentContainerStyle={styles.list}
        columnWrapperStyle={grid ? styles.columns : undefined}
        renderItem={({ item }) => {
          const qty = cartQty(item.id);
          const status = stockStatus(item.stock);
          const priceInput = productPriceInput(item);
          const invalidPrice = Boolean(priceInput) && !parsePositiveMoney(priceInput);
          const quantityValue = quantityInputs[item.id] ?? (qty > 0 ? String(qty) : "");

          return (
            <View style={[styles.productCard, !grid && styles.productListCard]}>
              <Pressable onPress={() => addProduct(item)} accessibilityRole="button" accessibilityLabel={`Add ${item.name}`} style={[styles.productArt, { backgroundColor: alphaColor(item.iconColor, 0.1) }]}>
                <Package size={30} color={item.iconColor} strokeWidth={1.9} />
                {qty > 0 ? <View style={styles.qtyBadge}><Text style={styles.qtyBadgeText}>{qty}</Text></View> : null}
              </Pressable>
              <Text style={styles.productName} numberOfLines={2}>{item.name}</Text>
              <Text style={styles.sku}>{item.sku}</Text>
              <View style={styles.priceRow}>
                <TextInput
                  value={priceInput}
                  onChangeText={(value) => updateProductPrice(item, value)}
                  keyboardType="decimal-pad"
                  placeholder="Sale price"
                  placeholderTextColor={colors.textPlaceholder}
                  style={[styles.employeePrice, invalidPrice && styles.invalidPrice]}
                  accessibilityLabel={`Selling price for ${item.name}`}
                />
                <Text style={[styles.statusText, { color: status.color, backgroundColor: status.bg }]}>{status.label}</Text>
              </View>
              {invalidPrice ? <Text style={styles.error}>Enter a valid price</Text> : null}
              <View style={styles.stepper}>
                <Pressable onPress={() => updateProductQty(item, qty - 1)} accessibilityRole="button" accessibilityLabel={`Decrease ${item.name}`} style={styles.stepperButton}>
                  <Minus size={13} color={colors.textMuted} />
                </Pressable>
                <TextInput
                  value={quantityValue}
                  onChangeText={(value) => {
                    if (value && !/^\d+$/.test(value)) {
                      Alert.alert("Quantity", "Enter a valid quantity.");
                      return;
                    }
                    setQuantityInputs((current) => ({ ...current, [item.id]: value }));
                  }}
                  onBlur={() => submitQuantityInput(item, quantityValue)}
                  onSubmitEditing={() => submitQuantityInput(item, quantityValue)}
                  keyboardType="number-pad"
                  placeholder="0"
                  placeholderTextColor={colors.textPlaceholder}
                  selectTextOnFocus
                  style={styles.stepperQtyInput}
                  accessibilityLabel={`Quantity for ${item.name}`}
                />
                <Pressable onPress={() => addProduct(item)} accessibilityRole="button" accessibilityLabel={`Increase ${item.name}`} style={styles.stepperButton}>
                  <Plus size={13} color={colors.primary} />
                </Pressable>
              </View>
            </View>
          );
        }}
      />

      {cartCount > 0 ? (
        <Pressable style={styles.cartFab} accessibilityLabel="Open cart" onPress={openCheckout}>
          <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.cartFabGradient}>
            <Wallet size={18} color={colors.surface} />
            <Text style={styles.cartText}>{cartCount} items</Text>
            <Text style={styles.cartTotal}>{formatCurrency(total)}</Text>
          </LinearGradient>
        </Pressable>
      ) : null}

      {checkoutVisible ? <AppBottomSheet ref={checkoutRef} snapPoints={["88%"]} onClose={() => setCheckoutVisible(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Complete sale</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator persistentScrollbar>
            {cartItems.map((item) => (
              <Card key={item.productId} style={styles.cartRow}>
                <View style={styles.cartBody}>
                  <Text style={styles.sheetItemName}>{item.name}</Text>
                  <Text style={styles.meta}>{item.qty} x {formatCurrency(item.price)}</Text>
                </View>
                <Text style={styles.lineTotal}>{formatCurrency(item.qty * item.price)}</Text>
              </Card>
            ))}
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Payment method</Text>
              <View style={styles.methodGrid}>
                {paymentMethods.map((method) => (
                  <Pressable
                    key={method.value}
                    onPress={() => setPaymentMethod(method.value)}
                    style={[styles.methodChip, paymentMethod === method.value && styles.methodChipActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Pay by ${method.label}`}
                  >
                    {method.value === "credit" ? <Wallet size={15} color={paymentMethod === method.value ? colors.surface : colors.primary} /> : <CreditCard size={15} color={paymentMethod === method.value ? colors.surface : colors.primary} />}
                    <Text style={[styles.methodChipText, paymentMethod === method.value && styles.methodChipTextActive]}>{method.label}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>{paymentMethod === "credit" ? "Credit customer" : "Customer"}</Text>
              <View style={styles.customerList}>
                {customers.map((customer) => (
                  <Pressable
                    key={customer.id}
                    onPress={() => setSelectedCustomerId(customer.id)}
                    style={[styles.customerChip, selectedCustomerId === customer.id && styles.customerChipActive]}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${customerDisplayName(customer)}`}
                  >
                    <Text style={[styles.customerName, selectedCustomerId === customer.id && styles.customerNameActive]}>{customerDisplayName(customer)}</Text>
                    {Number(customer.outstandingBalance) > 0 ? <Text style={styles.customerOwes}>{formatCurrency(Number(customer.outstandingBalance))} owed</Text> : null}
                  </Pressable>
                ))}
              </View>
            </View>
            <Card style={styles.totalCard}>
              <View style={styles.totalRow}><Text style={styles.meta}>Subtotal</Text><Text style={styles.totalValue}>{formatCurrency(cartSubtotal)}</Text></View>
              <View style={styles.amountRow}>
                <Text style={styles.meta}>Discount</Text>
                <TextInput value={discountInput} onChangeText={setDiscountInput} keyboardType="decimal-pad" style={styles.inlineAmountInput} accessibilityLabel="Sale discount" />
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.meta}>Tax</Text>
                <TextInput value={taxInput} onChangeText={setTaxInput} keyboardType="decimal-pad" style={styles.inlineAmountInput} accessibilityLabel="Sale tax" />
              </View>
              <View style={styles.amountRow}>
                <Text style={styles.meta}>Paid</Text>
                <TextInput value={paidInput} onChangeText={setPaidInput} keyboardType="decimal-pad" placeholder={formatCurrency(grandTotal)} placeholderTextColor={colors.textPlaceholder} style={styles.inlineAmountInput} accessibilityLabel="Amount paid" />
              </View>
              <TextInput value={referenceInput} onChangeText={setReferenceInput} placeholder="Payment reference" placeholderTextColor={colors.textPlaceholder} style={styles.referenceInput} accessibilityLabel="Payment reference" />
              <View style={styles.totalRow}><Text style={styles.grandLabel}>Total</Text><Text style={styles.grandValue}>{formatCurrency(grandTotal)}</Text></View>
              {(paymentMethod === "credit" || Math.max(0, grandTotal - paidAmount) > 0) ? <View style={styles.totalRow}><Text style={styles.meta}>Credit Balance</Text><Text style={styles.totalValue}>{formatCurrency(paymentMethod === "credit" ? grandTotal : Math.max(0, grandTotal - paidAmount))}</Text></View> : null}
            </Card>
          </ScrollView>
          <Button label={paymentMethod === "credit" ? "Confirm Credit Sale" : "Confirm Payment"} loading={processingSale} onPress={() => void handleCheckout()} />
        </View>
      </AppBottomSheet> : null}

      {collectVisible ? <AppBottomSheet ref={collectRef} snapPoints={["88%"]} onClose={() => setCollectVisible(false)}>
        <View style={styles.sheet}>
          <Text style={styles.sheetTitle}>Collect Credit</Text>
          <ScrollView contentContainerStyle={styles.sheetScroll} showsVerticalScrollIndicator persistentScrollbar>
            <View style={styles.section}>
              <Text style={styles.sectionTitle}>Open invoices</Text>
              {openCreditInvoices.map((invoice) => (
                <Pressable
                  key={invoice.id}
                  onPress={() => {
                    setSelectedCollectInvoice(invoice);
                    setCollectAmount(String(invoice.remaining));
                  }}
                  style={[styles.invoiceChip, selectedCollectInvoice?.id === invoice.id && styles.invoiceChipActive]}
                  accessibilityRole="button"
                  accessibilityLabel={`Select ${invoice.orderNumber}`}
                >
                  <View style={styles.cartBody}>
                    <Text style={styles.customerName}>{invoice.customerName}</Text>
                    <Text style={styles.meta}>{invoice.orderNumber} | {invoice.items.length} products</Text>
                  </View>
                  <Text style={styles.lineTotal}>{formatCurrency(invoice.remaining)}</Text>
                </Pressable>
              ))}
            </View>
            {selectedCollectInvoice ? (
              <>
                <View style={styles.quickRow}>
                  <Pressable style={styles.quickChip} onPress={() => setCollectAmount(String(selectedCollectInvoice.remaining / 2))}>
                    <Text style={styles.quickText}>Half</Text>
                  </Pressable>
                  <Pressable style={styles.quickChip} onPress={() => setCollectAmount(String(selectedCollectInvoice.remaining))}>
                    <Text style={styles.quickText}>Full</Text>
                  </Pressable>
                </View>
                <TextInput value={collectAmount} onChangeText={setCollectAmount} keyboardType="numeric" style={styles.amountInput} accessibilityLabel="Credit payment amount" />
                <View style={styles.methodGrid}>
                  {collectMethods.map((method) => (
                    <Pressable
                      key={method.value}
                      onPress={() => setCollectMethod(method.value)}
                      style={[styles.methodChip, collectMethod === method.value && styles.methodChipActive]}
                      accessibilityRole="button"
                      accessibilityLabel={`Collect by ${method.label}`}
                    >
                      <CreditCard size={15} color={collectMethod === method.value ? colors.surface : colors.primary} />
                      <Text style={[styles.methodChipText, collectMethod === method.value && styles.methodChipTextActive]}>{method.label}</Text>
                    </Pressable>
                  ))}
                </View>
              </>
            ) : null}
          </ScrollView>
          <Button label="Confirm Payment" variant="success" loading={collectingPayment} onPress={() => void handleCollectPayment()} />
        </View>
      </AppBottomSheet> : null}

      {receiptVisible ? <AppBottomSheet ref={receiptRef} snapPoints={["90%"]} onClose={() => setReceiptVisible(false)}>
        <View style={styles.sheet}>
          <View style={styles.receiptHeader}>
            <Text style={styles.sheetTitle}>Receipt Preview</Text>
            <Button label="Print" variant="ghost" icon={<Printer size={16} color={colors.primary} />} onPress={handlePrint} style={styles.printButton} />
          </View>
          <ScrollView showsVerticalScrollIndicator persistentScrollbar>{activeReceipt ? <ReceiptTicket receipt={activeReceipt} /> : null}</ScrollView>
        </View>
      </AppBottomSheet> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  header: {
    backgroundColor: colors.surface,
    paddingHorizontal: 10,
    paddingBottom: 8,
    gap: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLighter
  },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 7 },
  title: { flex: 1, color: colors.foreground, fontSize: 16, fontWeight: "900" },
  collectButton: {
    minHeight: 30,
    borderRadius: 999,
    paddingHorizontal: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: colors.orangeBg,
    borderWidth: 1,
    borderColor: colors.orangeBorder
  },
  collectText: { color: colors.orange, fontSize: 10, fontWeight: "900" },
  smallIconButton: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.mutedBg, alignItems: "center", justifyContent: "center" },
  addCircle: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
  searchBox: {
    minHeight: 38,
    borderRadius: 10,
    backgroundColor: colors.inputBg,
    borderWidth: 1,
    borderColor: colors.borderLighter,
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 10
  },
  searchInput: { flex: 1, color: colors.foreground, fontSize: 11, fontWeight: "600", paddingVertical: 0 },
  filters: { gap: 6, paddingBottom: 2 },
  chip: {
    color: colors.textMuted,
    backgroundColor: colors.mutedBg,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 7,
    fontSize: 10,
    fontWeight: "800",
    overflow: "hidden"
  },
  chipActive: { color: colors.surface, backgroundColor: colors.primary },
  list: { padding: 10, paddingBottom: 150, gap: 10 },
  columns: { gap: 10 },
  productCard: {
    flex: 1,
    minHeight: 155,
    borderRadius: 14,
    padding: 8,
    backgroundColor: colors.surface,
    gap: 4,
    ...shadows.card
  },
  productListCard: { width: "100%" },
  productArt: { height: 74, borderRadius: 12, alignItems: "center", justifyContent: "center", marginBottom: 2 },
  qtyBadge: {
    position: "absolute",
    top: 6,
    right: 6,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 5
  },
  qtyBadgeText: { color: colors.surface, fontSize: 10, fontWeight: "900" },
  productName: { color: colors.textSecondary, fontSize: 10, lineHeight: 13, fontWeight: "900" },
  sku: { color: colors.primary, fontSize: 8, fontWeight: "800" },
  emptyText: { color: colors.textMuted, fontSize: 12, fontWeight: "700", textAlign: "center", paddingVertical: 24 },
  priceRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 5 },
  price: { color: colors.foreground, fontSize: 12, fontWeight: "900" },
  employeePrice: { flex: 1, minHeight: 20, color: colors.foreground, fontSize: 11, fontWeight: "900", paddingVertical: 0, paddingHorizontal: 0 },
  invalidPrice: { color: colors.error },
  statusText: { borderRadius: 999, paddingHorizontal: 6, paddingVertical: 2, overflow: "hidden", fontSize: 7, fontWeight: "900" },
  error: { color: colors.error, fontSize: 8, fontWeight: "800" },
  stepper: {
    height: 28,
    borderRadius: 10,
    backgroundColor: colors.inputBg,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 7,
    marginTop: 2
  },
  stepperButton: { width: 28, height: 24, alignItems: "center", justifyContent: "center" },
  stepperQtyInput: { width: 48, color: colors.textMuted, fontSize: 10, fontWeight: "900", textAlign: "center", paddingVertical: 0 },
  cartFab: { position: "absolute", left: 16, right: 16, bottom: spacing.cartFABBottom, borderRadius: 18, overflow: "hidden", ...shadows.cartFAB },
  cartFabGradient: { height: 56, borderRadius: 18, flexDirection: "row", alignItems: "center", paddingHorizontal: 18, gap: 10 },
  cartText: { color: colors.surface, fontSize: 14, fontWeight: "800", flex: 1 },
  cartTotal: { color: colors.surface, fontSize: 14, fontWeight: "800" },
  sheet: { flex: 1, padding: 16, gap: 12 },
  sheetScroll: { gap: 12, paddingBottom: 16 },
  sheetTitle: { color: colors.foreground, fontSize: 18, fontWeight: "800" },
  cartRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  cartBody: { flex: 1 },
  sheetItemName: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 3 },
  lineTotal: { color: colors.foreground, fontSize: 13, fontWeight: "800" },
  section: { gap: 8 },
  sectionTitle: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  methodGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  methodChip: { minHeight: 44, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 7, backgroundColor: colors.surface },
  methodChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  methodChipText: { color: colors.primary, fontSize: 12, fontWeight: "800" },
  methodChipTextActive: { color: colors.surface },
  customerList: { gap: 8 },
  customerChip: { borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, padding: 12, backgroundColor: colors.surface },
  customerChipActive: { borderColor: colors.primary, backgroundColor: colors.secondaryBg },
  customerName: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  customerNameActive: { color: colors.primary },
  customerOwes: { color: colors.error, fontSize: 11, fontWeight: "700", marginTop: 3 },
  totalCard: { gap: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  amountRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 12 },
  inlineAmountInput: {
    minWidth: 120,
    minHeight: 38,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    color: colors.foreground,
    fontSize: 13,
    fontWeight: "800",
    textAlign: "right",
    paddingHorizontal: 10,
    paddingVertical: 6
  },
  referenceInput: {
    minHeight: 42,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: colors.borderLight,
    color: colors.foreground,
    fontSize: 12,
    fontWeight: "700",
    paddingHorizontal: 12
  },
  totalValue: { color: colors.textSecondary, fontSize: 13, fontWeight: "800" },
  grandLabel: { color: colors.foreground, fontSize: 15, fontWeight: "900" },
  grandValue: { color: colors.primary, fontSize: 16, fontWeight: "900" },
  invoiceChip: { minHeight: 62, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, padding: 12, backgroundColor: colors.surface, flexDirection: "row", alignItems: "center", gap: 10 },
  invoiceChipActive: { borderColor: colors.primary, backgroundColor: colors.secondaryBg },
  quickRow: { flexDirection: "row", gap: 8 },
  quickChip: { flex: 1, minHeight: 42, borderRadius: 14, backgroundColor: colors.secondaryBg, alignItems: "center", justifyContent: "center" },
  quickText: { color: colors.primary, fontSize: 12, fontWeight: "900" },
  amountInput: { minHeight: 52, borderRadius: 14, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 14, color: colors.foreground, fontSize: 20, fontWeight: "900" },
  receiptHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12 },
  printButton: { minHeight: 44, paddingHorizontal: 14 }
});
