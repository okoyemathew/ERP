import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Alert, StyleSheet, Switch, TextInput, View } from "react-native";
import { Text } from "@/i18n";
import { Button, Card, ScreenHeader } from "@/components/common";
import { ErrorState, LoadingState } from "@/components/common/StateViews";
import { cashRegisterService } from "@/services/cash-register.service";
import { colors, spacing } from "@/theme";
import type { CashRegisterSession, DailyBalance } from "@/types/cashRegister";
import { formatCurrency } from "@/utils/format";

const toNumber = (value: string | number | null | undefined) => Number(value ?? 0);

export function CashRegisterScreen() {
  const [register, setRegister] = useState<CashRegisterSession | null>(null);
  const [dailyBalance, setDailyBalance] = useState<DailyBalance | null>(null);
  const [openingBalance, setOpeningBalance] = useState("");
  const [actualBalance, setActualBalance] = useState("");
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [current, balance] = await Promise.all([
        cashRegisterService.current(),
        cashRegisterService.dailyBalance()
      ]);
      setRegister(current);
      setDailyBalance(balance);
      if (current) {
        setActualBalance(String(toNumber(current.expectedBalance).toFixed(2)));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Unable to load cash register.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const open = async () => {
    const amount = Number(openingBalance || 0);
    if (Number.isNaN(amount) || amount < 0) {
      Alert.alert("Invalid amount", "Opening balance must be zero or greater.");
      return;
    }
    setProcessing(true);
    try {
      const next = await cashRegisterService.open(amount);
      setRegister(next);
      setActualBalance(String(toNumber(next.expectedBalance).toFixed(2)));
      await load();
    } catch (openError) {
      Alert.alert("Unable to open register", openError instanceof Error ? openError.message : "Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const close = async () => {
    if (!register) return;
    const amount = Number(actualBalance || register.expectedBalance);
    if (Number.isNaN(amount) || amount < 0) {
      Alert.alert("Invalid amount", "Actual balance must be zero or greater.");
      return;
    }
    setProcessing(true);
    try {
      await cashRegisterService.close(amount);
      setRegister(null);
      await load();
    } catch (closeError) {
      Alert.alert("Unable to close register", closeError instanceof Error ? closeError.message : "Please try again.");
    } finally {
      setProcessing(false);
    }
  };

  const openStatus = Boolean(register);
  const totals = useMemo(() => {
    const cashIn = register
      ? toNumber(register.totals.cashSales) + toNumber(register.totals.creditPayments) + toNumber(register.totals.cashIn)
      : toNumber(dailyBalance?.cashReceived);
    const cashOut = register
      ? toNumber(register.totals.cashExpenses) + toNumber(register.totals.cashOut)
      : toNumber(dailyBalance?.expenses);
    const net = register ? toNumber(register.expectedBalance) : toNumber(dailyBalance?.closingBalance);
    return { cashIn, cashOut, net };
  }, [dailyBalance, register]);

  if (loading) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Cash Register" />
        <LoadingState label="Loading register" />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.screen}>
        <ScreenHeader title="Cash Register" />
        <ErrorState onRetry={() => void load()} />
      </View>
    );
  }

  const currentRegister = register;

  return (
    <View style={styles.screen}>
      <ScreenHeader title="Cash Register" />
      <View style={styles.content}>
        <Card style={styles.row}>
          <View>
            <Text style={styles.title}>{openStatus ? "Session Open" : "Session Closed"}</Text>
            <Text style={styles.meta}>{currentRegister ? `Opened ${new Date(currentRegister.openedAt).toLocaleTimeString()}` : "Opening balance"}</Text>
          </View>
          <Switch value={openStatus} onValueChange={() => (openStatus ? void close() : void open())} />
        </Card>
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          placeholder={formatCurrency(0)}
          placeholderTextColor={colors.textPlaceholder}
          value={openStatus ? actualBalance : openingBalance}
          onChangeText={openStatus ? setActualBalance : setOpeningBalance}
        />
        <View style={styles.grid}>
          <Card style={styles.stat}><Text style={styles.value}>{formatCurrency(totals.cashIn)}</Text><Text style={styles.meta}>Cash In</Text></Card>
          <Card style={styles.stat}><Text style={styles.value}>{formatCurrency(totals.cashOut)}</Text><Text style={styles.meta}>Cash Out</Text></Card>
          <Card style={styles.stat}><Text style={styles.value}>{formatCurrency(totals.net)}</Text><Text style={styles.meta}>Net</Text></Card>
        </View>
        <Card>
          <Text style={styles.title}>Daily Balance</Text>
          <Text style={styles.meta}>
            Sales {formatCurrency(toNumber(dailyBalance?.sales))} | Expenses {formatCurrency(toNumber(dailyBalance?.expenses))} | Credit {formatCurrency(toNumber(dailyBalance?.creditPayments))}
          </Text>
        </Card>
        <Button label={openStatus ? "Close Register" : "Open Register"} loading={processing} variant={openStatus ? "danger" : "primary"} onPress={() => (openStatus ? void close() : void open())} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.screenHorizontal, gap: 12 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  title: { color: colors.textSecondary, fontSize: 14, fontWeight: "800" },
  meta: { color: colors.textPlaceholder, fontSize: 11, marginTop: 4 },
  input: { minHeight: 52, borderRadius: 12, backgroundColor: colors.inputBg, borderWidth: 1.5, borderColor: colors.borderLight, paddingHorizontal: 14, color: colors.foreground },
  grid: { flexDirection: "row", gap: 10 },
  stat: { flex: 1 },
  value: { color: colors.foreground, fontSize: 16, fontWeight: "800" }
});
