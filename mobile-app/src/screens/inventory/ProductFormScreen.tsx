import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle } from "@/screens/shared/ScreenKit";
import { productsService } from "@/services/products.service";
import { useAuthStore } from "@/store/authStore";
import type { UpsertProductPayload } from "@/types/product";

type FormState = Omit<UpsertProductPayload, "purchasePrice" | "sellingPrice" | "baseSellingPrice" | "wholesalePrice" | "minimumStock" | "maximumStock" | "initialStock"> & {
  purchasePrice: string;
  sellingPrice: string;
  baseSellingPrice: string;
  wholesalePrice: string;
  minimumStock: string;
  maximumStock: string;
  actualNewStock: string;
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
  actualNewStock: "0",
  initialStock: "0",
  imageUrl: "",
  isActive: true
};

export function ProductFormScreen({ route, navigation }: { route: any; navigation: any }) {
  const productId = route.params?.productId as string | undefined;
  const user = useAuthStore((state) => state.user);
  const isOwner = user?.role === "owner" || user?.roleName === "Owner";
  const [form, setForm] = useState<FormState>(defaults);
  const [initialStockEdited, setInitialStockEdited] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);

  const title = productId ? "Edit Product" : "Create Product";

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
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
          actualNewStock: "",
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
  const setCreatedStock = (value: string) => {
    setInitialStockEdited(true);
    setForm((current) => ({ ...current, actualNewStock: value, initialStock: value }));
  };

  const generateBarcode = async () => {
    try {
      setField("barcode", await productsService.generateBarcode());
    } catch (barcodeError) {
      const message = barcodeError instanceof Error ? barcodeError.message : "Unable to generate barcode.";
      Alert.alert("Barcode", message);
    }
  };

  const save = async () => {
    const parseOptionalNumber = (value: string) => value.trim() ? Number(value) : undefined;
    const purchasePrice = parseOptionalNumber(form.purchasePrice);
    const sellingPrice = parseOptionalNumber(form.sellingPrice);
    const baseSellingPrice = parseOptionalNumber(form.baseSellingPrice);
    const wholesalePrice = parseOptionalNumber(form.wholesalePrice);
    const minimumStockInput = form.minimumStock.trim();
    const minimumStock = Number(minimumStockInput);
    const maximumStock = parseOptionalNumber(form.maximumStock);
    const actualNewStock = parseOptionalNumber(form.actualNewStock);
    const initialStock = parseOptionalNumber(form.initialStock);

    if (!form.name.trim() || !minimumStockInput) {
      Alert.alert("Missing details", "Product name and stock limit are required.");
      return;
    }
    if (!Number.isInteger(minimumStock) || minimumStock < 0) {
      Alert.alert("Invalid stock limit", "Stock limit must be a whole number greater than or equal to zero.");
      return;
    }
    if ((purchasePrice !== undefined && (Number.isNaN(purchasePrice) || purchasePrice < 0)) || (sellingPrice !== undefined && (Number.isNaN(sellingPrice) || sellingPrice < 0))) {
      Alert.alert("Invalid prices", "Purchase and selling prices must be valid numbers when entered.");
      return;
    }
    if (isOwner && baseSellingPrice !== undefined && (Number.isNaN(baseSellingPrice) || baseSellingPrice < 0)) {
      Alert.alert("Invalid base price", "Base selling price must be a valid number when entered.");
      return;
    }
    if (isOwner && baseSellingPrice !== undefined && sellingPrice !== undefined && sellingPrice < baseSellingPrice) {
      Alert.alert("Invalid base price", "Selling price cannot be lower than base selling price.");
      return;
    }
    if (wholesalePrice !== undefined && (Number.isNaN(wholesalePrice) || wholesalePrice < 0 || (sellingPrice !== undefined && wholesalePrice > sellingPrice))) {
      Alert.alert("Invalid wholesale price", "Wholesale price must be valid and cannot exceed selling price when entered.");
      return;
    }
    if (maximumStock !== undefined && (!Number.isInteger(maximumStock) || maximumStock < 0 || maximumStock < minimumStock)) {
      Alert.alert("Invalid stock limits", "Maximum stock cannot be lower than minimum stock.");
      return;
    }
    if (!productId && actualNewStock !== undefined && (!Number.isInteger(actualNewStock) || actualNewStock < 0)) {
      Alert.alert("Invalid stock", "Actual new stock must be a whole number greater than or equal to zero when entered.");
      return;
    }
    if (!productId && initialStock !== undefined && (!Number.isInteger(initialStock) || initialStock < 0)) {
      Alert.alert("Invalid stock", "Initial stock must be a whole number greater than or equal to zero when entered.");
      return;
    }

    setSaving(true);
    try {
      const payload: UpsertProductPayload = {
        categoryId: form.categoryId || undefined,
        brandId: form.brandId || undefined,
        supplierId: form.supplierId || undefined,
        unitId: form.unitId || undefined,
        name: form.name.trim(),
        sku: form.sku?.trim() || undefined,
        barcode: form.barcode?.trim() || undefined,
        description: form.description?.trim() || undefined,
        purchasePrice,
        sellingPrice,
        baseSellingPrice: isOwner ? baseSellingPrice : undefined,
        wholesalePrice,
        minimumStock,
        maximumStock,
        initialStock: productId ? undefined : actualNewStock ?? (initialStockEdited ? initialStock : undefined),
        imageUrl: form.imageUrl?.trim() || undefined,
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
        {!productId ? <Input label="Actual New Stock" value={form.actualNewStock} onChangeText={setCreatedStock} keyboardType="number-pad" /> : null}
        {!productId ? <Input label="Initial Stock" value={form.initialStock} onChangeText={setCreatedStock} keyboardType="number-pad" /> : null}
      </Card>

      <Button label="Save Product" loading={saving} onPress={save} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 }
});
