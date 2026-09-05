import React, { forwardRef, useMemo } from "react";
import GorhomBottomSheet, { BottomSheetBackdrop, BottomSheetView } from "@gorhom/bottom-sheet";
import { StyleSheet } from "react-native";
import { borderRadius, colors } from "@/theme";

interface AppBottomSheetProps {
  children: React.ReactNode;
  snapPoints?: string[];
  initialIndex?: number;
  onClose?: () => void;
}

export const AppBottomSheet = forwardRef<GorhomBottomSheet, AppBottomSheetProps>(({ children, snapPoints = ["82%"], initialIndex = -1, onClose }, ref) => {
  const points = useMemo(() => snapPoints, [snapPoints]);
  return (
    <GorhomBottomSheet
      ref={ref}
      index={initialIndex}
      snapPoints={points}
      enablePanDownToClose
      onClose={onClose}
      handleIndicatorStyle={styles.handle}
      backgroundStyle={styles.background}
      backdropComponent={(props) => <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.5} />}
    >
      <BottomSheetView style={styles.content}>{children}</BottomSheetView>
    </GorhomBottomSheet>
  );
});

const styles = StyleSheet.create({
  background: {
    borderTopLeftRadius: borderRadius.bottomSheet,
    borderTopRightRadius: borderRadius.bottomSheet,
    backgroundColor: colors.surface
  },
  handle: {
    width: 32,
    height: 4,
    backgroundColor: colors.borderLight
  },
  content: {
    flex: 1
  }
});
