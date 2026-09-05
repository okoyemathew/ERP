import React from "react";
import { FlatList, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, View } from "react-native";
import { Text } from "@/i18n";
import { ChevronRight } from "lucide-react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Card, ScreenHeader, Badge, statusVariant } from "@/components/common";
import { colors, spacing, typography } from "@/theme";

export function ScrollScreen({ title, children, right, onBack }: { title: string; children: React.ReactNode; right?: React.ReactNode; onBack?: () => void }) {
  const insets = useSafeAreaInsets();
  const bottomPadding = spacing.bottomNavHeight + Math.max(insets.bottom, 24) + 48;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === "ios" ? "padding" : "height"}>
      <ScreenHeader title={title} right={right} onBack={onBack} />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="interactive"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: React.ReactNode }) {
  return (
    <View style={styles.sectionTitle}>
      <Text style={styles.sectionText}>{title}</Text>
      {action}
    </View>
  );
}

export function SimpleRow({
  title,
  subtitle,
  amount,
  status,
  icon,
  onPress
}: {
  title: string;
  subtitle?: string;
  amount?: string;
  status?: string;
  icon?: React.ReactNode;
  onPress?: () => void;
}) {
  return (
    <Pressable onPress={onPress} accessibilityLabel={title}>
      <Card style={styles.rowCard}>
        {icon ? <View style={styles.icon}>{icon}</View> : null}
        <View style={styles.rowBody}>
          <Text style={styles.rowTitle} numberOfLines={1}>{title}</Text>
          {subtitle ? <Text style={styles.rowSubtitle} numberOfLines={1}>{subtitle}</Text> : null}
        </View>
        <View style={styles.rowRight}>
          {amount ? <Text style={styles.amount}>{amount}</Text> : null}
          {status ? <Badge label={status} variant={statusVariant(status)} /> : null}
        </View>
        {onPress ? <ChevronRight size={16} color={colors.borderLight} /> : null}
      </Card>
    </Pressable>
  );
}

export function ListScreen<T>({
  title,
  right,
  data,
  renderItem,
  keyExtractor,
  empty
}: {
  title: string;
  right?: React.ReactNode;
  data: T[];
  renderItem: ({ item }: { item: T }) => React.ReactElement;
  keyExtractor: (item: T) => string;
  empty?: React.ReactElement;
}) {
  return (
    <View style={styles.screen}>
      <ScreenHeader title={title} right={right} />
      <FlatList
        data={data}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ListEmptyComponent={empty}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background
  },
  content: {
    padding: spacing.screenHorizontal,
    paddingBottom: spacing.bottomNavHeight + 28,
    gap: spacing.sectionGap
  },
  sectionTitle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 4
  },
  sectionText: {
    ...typography.cardTitle,
    color: colors.textSecondary,
    fontWeight: "800"
  },
  rowCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12
  },
  icon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.secondaryBg
  },
  rowBody: {
    flex: 1,
    minWidth: 0
  },
  rowTitle: {
    ...typography.subtitle,
    color: colors.textSecondary
  },
  rowSubtitle: {
    ...typography.caption,
    color: colors.textMuted,
    marginTop: 3
  },
  rowRight: {
    alignItems: "flex-end",
    gap: 5
  },
  amount: {
    ...typography.subtitle,
    color: colors.foreground,
    fontWeight: "800"
  }
});
