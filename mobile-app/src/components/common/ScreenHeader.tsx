import React from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAppNavigationMenu } from "@/navigation/AppNavigationMenu";
import { colors, spacing, typography } from "@/theme";
import { useTranslation } from "@/i18n";

export function ScreenHeader({
  title,
  onBack,
  right,
}: {
  title: string;
  onBack?: () => void;
  right?: React.ReactNode;
}) {
  const insets = useSafeAreaInsets();
  const { t } = useTranslation();
  const navigationMenu = useAppNavigationMenu();
  const showMenu = !onBack && Boolean(navigationMenu);

  return (
    <View
      style={[
        styles.header,
        { paddingTop: Math.max(insets.top, spacing.statusBarTop) },
      ]}
    >
      <View style={styles.row}>
        {onBack ? (
          <Pressable
            onPress={onBack}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel={t("Go back")}
          >
            <ChevronLeft size={22} color={colors.textPlaceholder} />
          </Pressable>
        ) : showMenu ? (
          <Pressable
            onPress={navigationMenu?.openMenu}
            style={styles.back}
            accessibilityRole="button"
            accessibilityLabel={t("Open menu")}
          >
            <ChevronRight size={22} color={colors.textPlaceholder} />
          </Pressable>
        ) : null}
        <Text style={styles.title}>{title}</Text>
        {right ? <View style={styles.right}>{right}</View> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    backgroundColor: colors.surface,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLighter,
  },
  row: {
    minHeight: 56,
    paddingHorizontal: spacing.screenHorizontal,
    paddingBottom: 10,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  back: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginLeft: -12,
  },
  title: {
    ...typography.screenTitle,
    color: colors.foreground,
    flex: 1,
  },
  right: {
    minWidth: 44,
    alignItems: "flex-end",
  },
});
