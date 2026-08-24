import React, { useEffect } from "react";
import { StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { ShoppingCart } from "lucide-react-native";
import { LinearGradient } from "expo-linear-gradient";
import { colors } from "@/theme";

export function SplashScreen({ navigation }: { navigation: any }) {
  useEffect(() => {
    const timer = setTimeout(() => navigation.replace("Advert"), 2800);
    return () => clearTimeout(timer);
  }, [navigation]);

  return (
    <LinearGradient colors={[colors.primary, colors.primaryDark]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.screen}>
      <View style={styles.center}>
        <View style={styles.logo}>
          <ShoppingCart size={48} color={colors.surface} strokeWidth={1.6} />
        </View>
        <Text style={styles.title}>NexPOS</Text>
        <Text style={styles.subtitle}>Business Management System</Text>
      </View>
      <View style={styles.dots}>
        {[0, 1, 2].map((dot) => <View key={dot} style={styles.dot} />)}
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center"
  },
  center: {
    alignItems: "center"
  },
  logo: {
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: "rgba(255,255,255,0.2)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20
  },
  title: {
    color: colors.surface,
    fontSize: 32,
    fontWeight: "800"
  },
  subtitle: {
    color: "rgba(255,255,255,0.75)",
    fontSize: 14,
    marginTop: 6
  },
  dots: {
    position: "absolute",
    bottom: 56,
    flexDirection: "row",
    gap: 8
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    backgroundColor: "rgba(255,255,255,0.55)"
  }
});
