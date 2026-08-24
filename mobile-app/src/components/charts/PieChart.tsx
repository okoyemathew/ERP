import React from "react";
import { Dimensions } from "react-native";
import { PieChart as NativePieChart } from "react-native-chart-kit";
import { colors } from "@/theme";

export function PieChart({ data }: { data: Array<{ name: string; value: number; color: string }> }) {
  return (
    <NativePieChart
      data={data.map((item) => ({
        name: item.name,
        population: item.value,
        color: item.color,
        legendFontColor: colors.textMuted,
        legendFontSize: 11
      }))}
      width={Dimensions.get("window").width - 48}
      height={170}
      chartConfig={{ color: () => colors.primary }}
      accessor="population"
      backgroundColor="transparent"
      paddingLeft="0"
      absolute
    />
  );
}
