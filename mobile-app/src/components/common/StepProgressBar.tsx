import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "@/theme";

export function StepProgressBar({ step, total = 3 }: { step: number; total?: number }) {
  return (
    <View style={styles.row}>
      {Array.from({ length: total }).map((_, index) => {
        const current = index === step;
        const completed = index < step;
        return (
          <React.Fragment key={index}>
            <View style={[styles.dot, (current || completed) && styles.active]}>
              {current ? <View style={styles.centerDot} /> : null}
            </View>
            {index < total - 1 ? <View style={[styles.line, completed && styles.activeLine]} /> : null}
          </React.Fragment>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center"
  },
  dot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: colors.borderLight,
    alignItems: "center",
    justifyContent: "center"
  },
  active: {
    borderColor: colors.primary,
    backgroundColor: colors.primary
  },
  centerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.surface
  },
  line: {
    flex: 1,
    height: 2,
    backgroundColor: colors.borderLight
  },
  activeLine: {
    backgroundColor: colors.primary
  }
});
