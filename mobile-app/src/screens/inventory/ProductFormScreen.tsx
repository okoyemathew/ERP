import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { Text } from "@/i18n";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle, SimpleRow } from "@/screens/shared/ScreenKit";
import { productsService } from "@/services/products.service";
import { useAuthStore } from "@/store/authStore";
import { colors, typography } from "@/theme";
import type { ProductBrand, ProductCategory, ProductSupplier, ProductUnit, UpsertProductPayload } from "@/types/product";

type FormState = Omit<UpsertProductPayload, "purchasePrice" | "sellingPrice" | "baseSellingPrice" | "wholesalePrice" | "minimumStock" | "maximumStock" | "initialStock"> & {
  purchasePrice: string;
  sellingPrice: string;
  baseSellingPrice: string;
  wholesalePrice: string;
  minimumStock: string;
  maximumStock: string;
  initialStock: string;
};

const defaults: FormState = {
  categoryId: "",
  brandId: undefined,
  supplierId: undefined,
  unitId: "",
  name: "",
  sku: "",
  barcode: "",
  description: "",
  purchasePrice: "",
  sellingPrice: "",
  baseSellingPrice: "",
  wholesalePrice: "",
  minimumStock: "0",
  maximumStock: "",
  initialStock: "0",
  imageUrl: "",
  isActive: true
};

export function ProductFormScreen({ route, navigation }: { route: any; navigation: any }) {
  const productId = route.params?.productId as string | undefined;
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "owner" || user?.roleName === "Owner";
  const [form, setForm] = useState<FormState>(defaults);
  const [categories, setCategories] = useState<ProductCategory[]>([]);
  const [brands, setBrands] = useState<ProductBrand[]>([]);
  const [units, setUnits] = useState<ProductUnit[]>([]);
  const [suppliers, setSuppliers] = useState<ProductSupplier[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const title = productId ? "Edit Product" : "Create Product";
  const selectedCategory = useMemo(() => categories.find((item) => item.id === form.categoryId), [categories, form.categoryId]);
  const selectedBrand = useMemo(() => brands.find((item) => item.id === form.brandId), [brands, form.brandId]);
  const selectedUnit = useMemo(() => units.find((item) => item.id === form.unitId), [units, form.unitId]);
  const selectedSupplier = useMemo(() => suppliers.find((item) => item.id === form.supplierId), [suppliers, form.supplierId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const [categoryList, brandList, unitList, supplierList] = await Promise.all([
        productsService.categories(),
        productsService.brands(),
        productsService.units(),
        productsService.suppliers()
      ]);
      setCategories(categoryList);
      setBrands(brandList);
      setUnits(unitList);
      setSuppliers(supplierList);
      if (productId) {
        const product = await productsService.detail(productId);
        setForm({
          ...defaults,
          categoryId: product.categoryId,
          brandId: product.brandId ?? undefined,
          supplierId: product.supplierId ?? undefined,
          unitId: product.unitId,
          name: product.name,
          sku: product.sku,
          barcode: product.barcode ?? "",
          description: product.description ?? "",
          purchasePrice: String(product.purchasePrice),
          sellingPrice: String(product.sellingPrice),
          baseSellingPrice: product.baseSellingPrice === undefined ? "" : String(product.baseSellingPrice),
          wholesalePrice: product.wholesalePrice ? String(product.wholesalePrice) : "",
          minimumStock: String(product.minimumStock),
          maximumStock: product.maximumStock === null || product.maximumStock === undefined ? "" : String(product.maximumStock),
          initialStock: String(product.initialStockQuantity ?? 0),
          imageUrl: product.imageUrl ?? "",
          isActive: product.isActive
        });
      }
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [productId]);

  useEffect(() => {
    void load();
  }, [load]);

  const setField = (field: keyof FormState, value: string | boolean | undefined) => setForm((current) => ({ ...current, [field]: value }));

  const generateBarcode = async () => {
    try {
      setField("barcode", await productsService.generateBarcode());
    } catch (barcodeError) {
      const message = barcodeError instanceof Error ? barcodeError.message : "Unable to generate barcode.";
      Alert.alert("Barcode", message);
    }
  };

  const save = async () => {
    const purchasePrice = Number(form.purchasePrice);
    const sellingPrice = Number(form.sellingPrice);
    const baseSellingPrice = form.baseSellingPrice ? Number(form.baseSellingPrice) : undefined;
    const wholesalePrice = form.wholesalePrice ? Number(form.wholesalePrice) : undefined;
    const minimumStock = Number(form.minimumStock || 0);
    const maximumStock = form.maximumStock ? Number(form.maximumStock) : undefined;
    const initialStock = form.initialStock ? Number(form.initialStock) : 0;

    if (!form.name || !form.sku || !form.categoryId || !form.unitId) {
      Alert.alert("Missing details", "Product name, SKU, category, and unit are required.");
      return;
    }
    if (Number.isNaN(purchasePrice) || Number.isNaN(sellingPrice) || purchasePrice < 0 || sellingPrice < 0) {
      Alert.alert("Invalid prices", "Purchase and selling prices must be valid numbers.");
      return;
    }
    if (isOwner && (baseSellingPrice === undefined || Number.isNaN(baseSellingPrice) || baseSellingPrice < 0)) {
      Alert.alert("Invalid base price", "Base selling price must be a valid number.");
      return;
    }
    if (isOwner && baseSellingPrice !== undefined && sellingPrice < baseSellingPrice) {
      Alert.alert("Invalid base price", "Selling price cannot be lower than base selling price.");
      return;
    }
    if (wholesalePrice !== undefined && (Number.isNaN(wholesalePrice) || wholesalePrice < 0 || wholesalePrice > sellingPrice)) {
      Alert.alert("Invalid wholesale price", "Wholesale price must be valid and cannot exceed selling price.");
      return;
    }
    if (maximumStock !== undefined && maximumStock < minimumStock) {
      Alert.alert("Invalid stock limits", "Maximum stock cannot be lower than minimum stock.");
      return;
    }
    if (!productId && (!Number.isInteger(initialStock) || initialStock < 0)) {
      Alert.alert("Invalid stock", "Initial stock must be a whole number greater than or equal to zero.");
      return;
    }

    setSaving(true);
    try {
      const payload: UpsertProductPayload = {
        categoryId: form.categoryId,
        brandId: form.brandId,
        supplierId: form.supplierId,
        unitId: form.unitId,
        name: form.name,
        sku: form.sku,
        barcode: form.barcode || undefined,
        description: form.description || undefined,
        purchasePrice,
        sellingPrice,
        baseSellingPrice: isOwner ? baseSellingPrice : undefined,
        wholesalePrice,
        minimumStock,
        maximumStock,
        initialStock: productId ? undefined : initialStock,
        imageUrl: form.imageUrl || undefined,
        isActive: form.isActive
      };
      if (productId) await productsService.update(productId, payload);
      else await productsService.create(payload);
      navigation.goBack();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save product.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <LoadingState label="Loading product form" />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ScrollScreen title={title} onBack={() => navigation.goBack()}>
      <SectionTitle title="Product Information" />
      <Card style={styles.form}>
        <Input label="Product Name" value={form.name} onChangeText={(value) => setField("name", value)} />
        <Input label="SKU" value={form.sku} onChangeText={(value) => setField("sku", value)} autoCapitalize="characters" />
        <Input label="Barcode" value={form.barcode ?? ""} onChangeText={(value) => setField("barcode", value)} />
        <Button label="Generate Barcode" variant="ghost" onPress={generateBarcode} />
        <Input label="Image URL" value={form.imageUrl ?? ""} onChangeText={(value) => setField("imageUrl", value)} autoCapitalize="none" />
        <Input label="Description" value={form.description ?? ""} onChangeText={(value) => setField("description", value)} />
      </Card>

      <SectionTitle title="Pricing and Stock" />
      <Card style={styles.form}>
        <Input label="Purchase Price" value={form.purchasePrice} onChangeText={(value) => setField("purchasePrice", value)} keyboardType="decimal-pad" />
        <Input label="Selling Price" value={form.sellingPrice} onChangeText={(value) => setField("sellingPrice", value)} keyboardType="decimal-pad" />
        {isOwner ? <Input label="Base Selling Price" value={form.baseSellingPrice} onChangeText={(value) => setField("baseSellingPrice", value)} keyboardType="decimal-pad" /> : null}
        <Input label="Wholesale Price" value={form.wholesalePrice} onChangeText={(value) => setField("wholesalePrice", value)} keyboardType="decimal-pad" />
        <Input label="Minimum Stock" value={form.minimumStock} onChangeText={(value) => setField("minimumStock", value)} keyboardType="number-pad" />
        <Input label="Maximum Stock" value={form.maximumStock} onChangeText={(value) => setField("maximumStock", value)} keyboardType="number-pad" />
        {!productId ? <Input label="Initial Stock" value={form.initialStock} onChangeText={(value) => setField("initialStock", value)} keyboardType="number-pad" /> : null}
      </Card>

      <OptionSection title="Category" selected={selectedCategory?.name} options={categories.map((item) => ({ id: item.id, title: item.name }))} onSelect={(id) => setField("categoryId", id)} onManage={() => navigation.navigate("ProductOptionManager", { kind: "category" })} />
      <OptionSection title="Brand" selected={selectedBrand?.name ?? "No brand"} options={brands.map((item) => ({ id: item.id, title: item.name }))} onSelect={(id) => setField("brandId", id)} onManage={() => navigation.navigate("ProductOptionManager", { kind: "brand" })} />
      <OptionSection title="Unit" selected={selectedUnit ? `${selectedUnit.name} (${selectedUnit.symbol})` : undefined} options={units.map((item) => ({ id: item.id, title: `${item.name} (${item.symbol})` }))} onSelect={(id) => setField("unitId", id)} onManage={() => navigation.navigate("ProductOptionManager", { kind: "unit" })} />
      <OptionSection title="Supplier" selected={selectedSupplier?.companyName ?? "No supplier"} options={suppliers.map((item) => ({ id: item.id, title: item.companyName }))} onSelect={(id) => setField("supplierId", id)} />

      <Button label="Save Product" loading={saving} onPress={save} />
    </ScrollScreen>
  );
}

function OptionSection({ title, selected, options, onSelect, onManage }: { title: string; selected?: string; options: Array<{ id: string; title: string }>; onSelect: (id: string) => void; onManage?: () => void }) {
  return (
    <>
      <SectionTitle title={title} action={onManage ? <Text style={styles.manage} onPress={onManage}>Manage</Text> : undefined} />
      <Card style={styles.form}>
        <Text style={styles.selected}>{selected ?? `Select ${title.toLowerCase()}`}</Text>
        {options.map((option) => <SimpleRow key={option.id} title={option.title} onPress={() => onSelect(option.id)} />)}
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 },
  selected: { ...typography.subtitle, color: colors.textSecondary, fontWeight: "800" },
  manage: { ...typography.caption, color: colors.primary, fontWeight: "800" }
});
