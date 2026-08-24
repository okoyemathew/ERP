import React, { useCallback, useEffect, useState } from "react";
import { Alert, StyleSheet, View } from "react-native";
import { Button, Card, Input, LoadingState } from "@/components/common";
import { ScrollScreen } from "@/screens/shared/ScreenKit";
import { customersService } from "@/services/customers.service";
import type { UpsertCustomerPayload } from "@/types/customer";

type FormState = {
  customerCode: string;
  firstName: string;
  lastName: string;
  companyName: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  country: string;
  creditLimit: string;
  outstandingBalance: string;
  notes: string;
};

const emptyForm: FormState = {
  customerCode: "",
  firstName: "",
  lastName: "",
  companyName: "",
  email: "",
  phone: "",
  address: "",
  city: "",
  state: "",
  country: "",
  creditLimit: "0",
  outstandingBalance: "0",
  notes: ""
};

function cleanPayload(form: FormState): UpsertCustomerPayload {
  return {
    customerCode: form.customerCode.trim() || undefined,
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim() || undefined,
    companyName: form.companyName.trim() || undefined,
    email: form.email.trim() || undefined,
    phone: form.phone.trim(),
    address: form.address.trim() || undefined,
    city: form.city.trim() || undefined,
    state: form.state.trim() || undefined,
    country: form.country.trim() || undefined,
    creditLimit: Number(form.creditLimit || 0),
    outstandingBalance: Number(form.outstandingBalance || 0),
    notes: form.notes.trim() || undefined
  };
}

export function CustomerFormScreen({ route, navigation }: { route: any; navigation: any }) {
  const customerId = route.params?.customerId as string | undefined;
  const editing = Boolean(customerId);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(Boolean(customerId));
  const [saving, setSaving] = useState(false);

  const setField = (key: keyof FormState, value: string) => setForm((current) => ({ ...current, [key]: value }));

  const loadCustomer = useCallback(async () => {
    if (!customerId) return;
    setLoading(true);
    try {
      const customer = await customersService.detail(customerId);
      setForm({
        firstName: customer.firstName,
        customerCode: customer.customerCode ?? "",
        lastName: customer.lastName ?? "",
        companyName: customer.companyName ?? "",
        email: customer.email ?? "",
        phone: customer.phone,
        address: customer.address ?? "",
        city: customer.city ?? "",
        state: customer.state ?? "",
        country: customer.country ?? "",
        creditLimit: String(customer.creditLimit ?? 0),
        outstandingBalance: String(customer.outstandingBalance ?? 0),
        notes: customer.notes ?? ""
      });
    } catch (error) {
      Alert.alert("Unable to load customer", error instanceof Error ? error.message : "Please try again.");
      navigation.goBack();
    } finally {
      setLoading(false);
    }
  }, [customerId, navigation]);

  useEffect(() => {
    void loadCustomer();
  }, [loadCustomer]);

  const save = async () => {
    const payload = cleanPayload(form);
    if (!payload.firstName || !payload.phone) {
      Alert.alert("Missing details", "Customer name and phone are required.");
      return;
    }
    if (Number.isNaN(payload.creditLimit) || Number.isNaN(payload.outstandingBalance)) {
      Alert.alert("Check amounts", "Credit limit and outstanding balance must be valid numbers.");
      return;
    }

    setSaving(true);
    try {
      if (customerId) {
        await customersService.update(customerId, payload);
      } else {
        await customersService.create(payload);
      }
      navigation.goBack();
    } catch (error) {
      Alert.alert("Unable to save customer", error instanceof Error ? error.message : "Please try again.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScrollScreen title={editing ? "Edit Customer" : "New Customer"} onBack={() => navigation.goBack()}>
          <LoadingState label="Loading customer" />
        </ScrollScreen>
      </View>
    );
  }

  return (
    <ScrollScreen title={editing ? "Edit Customer" : "New Customer"} onBack={() => navigation.goBack()}>
      <Card style={styles.form}>
        <Input label="First Name" value={form.firstName} onChangeText={(value) => setField("firstName", value)} />
        <Input label="Customer Code" value={form.customerCode} onChangeText={(value) => setField("customerCode", value)} />
        <Input label="Last Name" value={form.lastName} onChangeText={(value) => setField("lastName", value)} />
        <Input label="Company" value={form.companyName} onChangeText={(value) => setField("companyName", value)} />
        <Input label="Phone" value={form.phone} onChangeText={(value) => setField("phone", value)} keyboardType="phone-pad" />
        <Input label="Email" value={form.email} onChangeText={(value) => setField("email", value)} keyboardType="email-address" autoCapitalize="none" />
        <Input label="Address" value={form.address} onChangeText={(value) => setField("address", value)} />
        <Input label="City" value={form.city} onChangeText={(value) => setField("city", value)} />
        <Input label="Credit Limit" value={form.creditLimit} onChangeText={(value) => setField("creditLimit", value)} keyboardType="decimal-pad" />
        <Input label="Outstanding Balance" value={form.outstandingBalance} onChangeText={(value) => setField("outstandingBalance", value)} keyboardType="decimal-pad" />
        <Input label="Notes" value={form.notes} onChangeText={(value) => setField("notes", value)} multiline />
      </Card>
      <Button label={editing ? "Save Customer" : "Create Customer"} loading={saving} onPress={save} />
    </ScrollScreen>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  form: { gap: 12 }
});
