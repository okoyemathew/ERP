import React, { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { Package, Shield, TrendingUp, Users } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { markOnboardingCompleted } from "@/api/authFlowStorage";
import { Button } from "@/components/common";
import { colors } from "@/theme";

const slides = [
  { icon: TrendingUp, title: "Real-time Sales", subtitle: "Track every sale the moment it happens." },
  { icon: Package, title: "Smart Inventory", subtitle: "Automated stock tracking and low-stock alerts." },
  { icon: Users, title: "Customer Credit", subtitle: "Manage balances, invoices and payment history." },
  { icon: Shield, title: "Role Based Access", subtitle: "Owner controls stay protected from employee flows." }
];

export function OnboardingScreen({ navigation }: { navigation: any }) {
  const [page, setPage] = useState(0);
  const slide = slides[page];
  const Icon = slide.icon;
  const goToLogin = async () => {
    await markOnboardingCompleted();
    navigation.replace("Login");
  };
  const next = () => (page < slides.length - 1 ? setPage(page + 1) : void goToLogin());
  return (
    <LinearGradient colors={[colors.primary, colors.primaryDark]} style={styles.screen}>
      <Pressable onPress={() => void goToLogin()} style={styles.skip} accessibilityLabel="Skip onboarding">
        <Text style={styles.skipText}>Skip</Text>
      </Pressable>
      <View style={styles.center}>
        <View style={styles.icon}>
          <Icon size={60} color={colors.primary} strokeWidth={1.5} />
        </View>
        <Text style={styles.title}>{slide.title}</Text>
        <Text style={styles.subtitle}>{slide.subtitle}</Text>
      </View>
      <View style={styles.footer}>
        <View style={styles.dots}>
          {slides.map((_, index) => <View key={index} style={[styles.dot, index === page && styles.activeDot]} />)}
        </View>
        <Button label={page === slides.length - 1 ? "Get Started" : "Next"} variant="ghost" onPress={next} style={styles.button} />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, padding: 24 },
  skip: { alignSelf: "flex-end", paddingTop: 48, minWidth: 44, minHeight: 44 },
  skipText: { color: "rgba(255,255,255,0.75)", fontWeight: "700" },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  icon: { width: 144, height: 144, borderRadius: 36, backgroundColor: colors.surface, alignItems: "center", justifyContent: "center", marginBottom: 32 },
  title: { color: colors.surface, fontSize: 26, fontWeight: "800", textAlign: "center" },
  subtitle: { color: "rgba(255,255,255,0.74)", fontSize: 14, textAlign: "center", lineHeight: 23, marginTop: 12 },
  footer: { paddingBottom: 24, gap: 24 },
  dots: { flexDirection: "row", gap: 8, alignSelf: "center" },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: "rgba(255,255,255,0.35)" },
  activeDot: { width: 28, backgroundColor: colors.surface },
  button: { backgroundColor: colors.surface }
});
