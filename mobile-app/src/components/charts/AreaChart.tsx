import React from "react";
import { Dimensions, StyleSheet, View } from "react-native";
import { LineChart } from "react-native-chart-kit";
import { colors } from "@/theme";

export function AreaChart({ data }: { data: Array<{ label: string; revenue: number }> }) {
  const width = Math.min(Dimensions.get("window").width - 64, 340);
  return (
    <View style={styles.wrap}>
      <LineChart
        data={{
          labels: data.map((item) => item.label),
          datasets: [{ data: data.map((item) => item.revenue) }]
        }}
        width={width}
        height={150}
        withInnerLines={false}
        withOuterLines={false}
        withVerticalLabels
        withHorizontalLabels={false}
        chartConfig={{
          backgroundGradientFrom: colors.surface,
          backgroundGradientTo: colors.surface,
          color: () => colors.primary,
          fillShadowGradientFrom: colors.primary,
          fillShadowGradientTo: colors.surface,
          decimalPlaces: 0,
          propsForDots: { r: "0" },
          labelColor: () => colors.textPlaceholder
        }}
        bezier
        style={styles.chart}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: "center",
    overflow: "hidden"
  },
  chart: {
    borderRadius: 12,
    marginLeft: -18
  }
});
