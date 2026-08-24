import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet } from "react-native";
import { Button, Card, ErrorState, Input, LoadingState } from "@/components/common";
import { ScrollScreen, SectionTitle, SimpleRow } from "@/screens/shared/ScreenKit";
import { productsService } from "@/services/products.service";
import type { ProductBrand, ProductCategory, ProductUnit } from "@/types/product";

type Kind = "category" | "brand" | "unit";
type Option = ProductCategory | ProductBrand | ProductUnit;

export function ProductOptionManagerScreen({ route, navigation }: { route: any; navigation: any }) {
  const kind = route.params?.kind as Kind;
  const [items, setItems] = useState<Option[]>([]);
  const [editing, setEditing] = useState<Option | null>(null);
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [description, setDescription] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const title = useMemo(() => `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`, [kind]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const data = kind === "category" ? await productsService.categories() : kind === "brand" ? await productsService.brands() : await productsService.units();
      setItems(data);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [kind]);

  useEffect(() => {
    void load();
  }, [load]);

  const startEdit = (item: Option) => {
    setEditing(item);
    setName(item.name);
    setSymbol("symbol" in item ? item.symbol : "");
    setDescription(item.description ?? "");
  };

  const reset = () => {
    setEditing(null);
    setName("");
    setSymbol("");
    setDescription("");
  };

  const save = async () => {
    if (!name.trim()) {
      Alert.alert("Missing name", "Name is required.");
      return;
    }
    if (kind === "unit" && !symbol.trim()) {
      Alert.alert("Missing symbol", "Unit symbol is required.");
      return;
    }
    setSaving(true);
    try {
      const basePayload = { name, description: description || undefined };
      if (kind === "category") {
        const payload = { ...basePayload, code: symbol || undefined };
        editing ? await productsService.updateCategory(editing.id, payload) : await productsService.createCategory(payload);
      }
      if (kind === "brand") editing ? await productsService.updateBrand(editing.id, basePayload) : await productsService.createBrand(basePayload);
      if (kind === "unit") {
        const payload = { ...basePayload, symbol };
        editing ? await productsService.updateUnit(editing.id, payload) : await productsService.createUnit(payload);
      }
      reset();
      await load();
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Unable to save.";
      Alert.alert("Unable to save", message);
    } finally {
      setSaving(false);
    }
  };

  const deactivate = async (item: Option) => {
    try {
      if (kind === "category") await productsService.deactivateCategory(item.id);
      if (kind === "brand") await productsService.deactivateBrand(item.id);
      if (kind === "unit") await productsService.deactivateUnit(item.id);
      await load();
    } catch (deactivateError) {
      const message = deactivateError instanceof Error ? deactivateError.message : "Unable to deactivate.";
      Alert.alert("Unable to update", message);
    }
  };

  if (loading) return <LoadingState label={`Loading ${title.toLowerCase()}`} />;
  if (error) return <ErrorState onRetry={load} />;

  return (
    <ScrollScreen title={title} onBack={() => navigation.goBack()}>
      <SectionTitle title={editing ? "Edit" : "Create"} />
      <Card style={styles.form}>
        <Input label="Name" value={name} onChangeText={setName} />
        {kind === "unit" ? <Input label="Symbol" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" /> : null}
        {kind === "category" ? <Input label="Code" value={symbol} onChangeText={setSymbol} autoCapitalize="characters" /> : null}
        <Input label="Description" value={description} onChangeText={setDescription} />
        <Button label={editing ? "Update" : "Create"} loading={saving} onPress={save} />
        {editing ? <Button label="Cancel Edit" variant="ghost" onPress={reset} /> : null}
      </Card>

      <SectionTitle title="Active" />
      {items.map((item) => (
        <SimpleRow key={item.id} title={"symbol" in item ? `${item.name} (${item.symbol})` : item.name} subtitle={item.description ?? undefined} status={item.isActive ? "Active" : "Inactive"} onPress={() => startEdit(item)} amount="Deactivate" />
      ))}
      {items.map((item) => (
        <Button key={`${item.id}-deactivate`} label={`Deactivate ${item.name}`} variant="danger" onPress={() => void deactivate(item)} />
      ))}
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  form: { gap: 12 }
});
