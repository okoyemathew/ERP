import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Button, Card, Input, LoadingState } from "@/components/common";
import { ScrollScreen } from "@/screens/shared/ScreenKit";
import { suppliersService } from "@/services/suppliers.service";
import type { UpsertSupplierPayload } from "@/types/supplier";

type FormState = Omit<UpsertSupplierPayload, "outstandingBalance"> & {
  outstandingBalance: string;
};

const emptyForm: FormState = {
  supplierCode: "",
  companyName: "",
  contactPerson: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  country: "",
  taxNumber: "",
  outstandingBalance: "0",
  notes: ""
};

function cleanPayload(form: FormState): UpsertSupplierPayload {
  return {
    supplierCode: form.supplierCode?.trim() || undefined,
    companyName: form.companyName.trim(),
    contactPerson: form.contactPerson?.trim() || undefined,
    email: form.email?.trim() || undefined,
    phone: form.phone.trim(),
    address: form.address?.trim() || undefined,
    city: form.city?.trim() || undefined,
    state: form.state?.trim() || undefined,
    country: form.country?.trim() || undefined,
    taxNumber: form.taxNumber?.trim() || undefined,
    outstandingBalance: Number(form.outstandingBalance || 0),
    notes: form.notes?.trim() || undefined
  };
}

export function SupplierFormScreen({ route, navigation }: { route: any; navigation: any }) {
  const supplierId = route.params?.supplierId as string | undefined;
  const editing = Boolean(supplierId);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(Boolean(supplierId));
  const [saving, setSaving] = useState(false);

  const setField = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const loadSupplier = useCallback(async () => {
    if (!supplierId) return;
    setLoading(true);
    try {
      const supplier = await suppliersService.detail(supplierId);
      setForm({
        supplierCode: supplier.supplierCode ?? "",
        companyName: supplier.companyName,
        contactPerson: supplier.contactPerson ?? "",
        email: supplier.email ?? "",
        phone: supplier.phone,
        address: supplier.address ?? "",
        city: supplier.city ?? "",
        state: supplier.state ?? "",
        country: supplier.country ?? "",
        taxNumber: supplier.taxNumber ?? "",
        outstandingBalance: String(supplier.outstandingBalance ?? 0),
        notes: supplier.notes ?? ""
      });
    } catch (error) {
      Alert.alert("Unable to load supplier", error instanceof Error ? error.message : "Please try again.");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [navigation, supplierId]);

  useEffect(() => {
    void loadSupplier();
  }, [loadSupplier]);

  const save = async () => {
    const payload = cleanPayload(form);
    if (!payload.companyName || !payload.phone) {
      Alert.alert("Missing details", "Supplier company name and phone are required.");
      return;
    }
    if (Number.isNaN(payload.outstandingBalance)) {
      Alert.alert("Check balance", "Outstanding balance must be a valid number.");
      return;
    }

    setSaving(true);
    try {
      if (supplierId) {
        await suppliersService.update(supplierId, payload);
      } else {
        await suppliersService.create(payload);
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert("Unable to save supplier", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScrollScreen title={editing ? "Edit Supplier" : "New Supplier"} onBack={() => navigation.goBack()}>
          <LoadingState label="Loading supplier" />
        </ScrollScreen>
      </View>
    );
  }

  return (
    <ScrollScreen title={editing ? "Edit Supplier" : "New Supplier"} onBack={() => navigation.goBack()}>
      <Card style={styles.form}>
        <Input label="Supplier Code" value={form.supplierCode} onChangeText={(value) => setField("supplierCode", value)} />
        <Input label="Company Name" value={form.companyName} onChangeText={(value) => setField("companyName", value)} />
        <Input label="Contact Person" value={form.contactPerson} onChangeText={(value) => setField("contactPerson", value)} />
        <Input label="Phone" value={form.phone} onChangeText={(value) => setField("phone", value)} keyboardType="phone-pad" />
        <Input label="Email" value={form.email} onChangeText={(value) => setField("email", value)} keyboardType="email-address" autoCapitalize="none" />
        <Input label="Address" value={form.address} onChangeText={(value) => setField("address", value)} />
        <Input label="City" value={form.city} onChangeText={(value) => setField("city", value)} />
        <Input label="Tax Number" value={form.taxNumber} onChangeText={(value) => setField("taxNumber", value)} />
        <Input label="Outstanding Balance" value={form.outstandingBalance} onChangeText={(value) => setField("outstandingBalance", value)} keyboardType="decimal-pad" />
        <Input label="Notes" value={form.notes} onChangeText={(value) => setField("notes", value)} multiline />
      </Card>
      <Button label={editing ? "Save Supplier" : "Create Supplier"} loading={saving} onPress={save} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  form: { gap: 12 }
});
